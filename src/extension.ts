import * as vscode from 'vscode';
import { window } from 'vscode';
import { ManimShell } from './manimShell';
import { ManimCell } from './manimCell';
import { ManimCellRanges } from './manimCellRanges';
import { previewCode } from './previewCode';
import { startScene, exitScene } from './startStopScene';
import { Logger, Window, recordLogFile, finishRecordingLogFile } from './logger';

export function activate(context: vscode.ExtensionContext) {
	// Trigger the Manim shell to start listening to the terminal
	ManimShell.instance;

	const previewManimCellCommand = vscode.commands.registerCommand(
		'manim-notebook.previewManimCell', (cellCode?: string, startLine?: number) => {
			Logger.info(`💠 Command requested: Preview Manim Cell, startLine=${startLine}`);
			previewManimCell(cellCode, startLine);
		});

	const previewSelectionCommand = vscode.commands.registerCommand(
		'manim-notebook.previewSelection', () => {
			Logger.info("💠 Command requested: Preview Selection");
			previewSelection();
		}
	);

	const startSceneCommand = vscode.commands.registerCommand(
		'manim-notebook.startScene', () => {
			Logger.info("💠 Command requested: Start Scene");
			startScene();
		}
	);

	const exitSceneCommand = vscode.commands.registerCommand(
		'manim-notebook.exitScene', () => {
			Logger.info("💠 Command requested: Exit Scene");
			exitScene();
		}
	);

	const clearSceneCommand = vscode.commands.registerCommand(
		'manim-notebook.clearScene', () => {
			Logger.info("💠 Command requested: Clear Scene");
			clearScene();
		}
	);

	const recordLogFileCommand = vscode.commands.registerCommand(
		'manim-notebook.recordLogFile', async () => {
			Logger.info("💠 Command requested: Record Log File");
			await recordLogFile(context);
		});

	// internal command
	const finishRecordingLogFileCommand = vscode.commands.registerCommand(
		'manim-notebook.finishRecordingLogFile', async () => {
			Logger.info("💠 Command requested: Finish Recording Log File");
			await finishRecordingLogFile(context);
		});

	context.subscriptions.push(
		previewManimCellCommand,
		previewSelectionCommand,
		startSceneCommand,
		exitSceneCommand,
		clearSceneCommand,
		recordLogFileCommand,
		finishRecordingLogFileCommand
	);
	registerManimCellProviders(context);

	Logger.info("Manim Notebook activated");
	Logger.logSystemInformation();
}

export function deactivate() {
	Logger.deactivate();
	Logger.info("💠 Manim Notebook extension deactivated");
}

/**
 * Previews the Manim code of the cell where the cursor is placed
 * (when accessed via the command pallette) or the code of the cell where
 * the codelens was clicked.
 */
async function previewManimCell(cellCode?: string, startLine?: number) {
	let startLineFinal: number | undefined = startLine;

	// User has executed the command via command pallette
	if (cellCode === undefined) {
		const editor = window.activeTextEditor;
		if (!editor) {
			Window.showErrorMessage(
				'No opened file found. Place your cursor in a Manim cell.');
			return;
		}
		const document = editor.document;

		// Get the code of the cell where the cursor is placed
		const cursorLine = editor.selection.active.line;
		const range = ManimCellRanges.getCellRangeAtLine(document, cursorLine);
		if (!range) {
			Window.showErrorMessage('Place your cursor in a Manim cell.');
			return;
		}
		cellCode = document.getText(range);
		startLineFinal = range.start.line;
	}

	if (startLineFinal === undefined) {
		Window.showErrorMessage('Internal error: Line number not found in `previewManimCell()`.');
		return;
	}

	await previewCode(cellCode, startLineFinal);
}

/**
 * Previews the Manim code of the selected text.
 */
async function previewSelection() {
	const editor = window.activeTextEditor;
	if (!editor) {
		Window.showErrorMessage('Select some code to preview.');
		return;
	}

	let selectedText;
	const selection = editor.selection;
	if (selection.isEmpty) {
		// If nothing is selected - select the whole line
		const line = editor.document.lineAt(selection.start.line);
		selectedText = editor.document.getText(line.range);
	} else {
		// If selected - extend selection to start and end of lines
		const range = new vscode.Range(
			editor.document.lineAt(selection.start.line).range.start,
			editor.document.lineAt(selection.end.line).range.end
		);
		selectedText = editor.document.getText(range);
	}

	if (!selectedText) {
		Window.showErrorMessage('Select some code to preview.');
		return;
	}

	await previewCode(selectedText, selection.start.line);
}

/**
 * Runs the `clear()` command in the terminal to remove all objects from
 * the scene.
 */
async function clearScene() {
	try {
		await ManimShell.instance.executeCommandErrorOnNoActiveSession("clear()");
	} catch (NoActiveSessionError) {
		Window.showErrorMessage('No active Manim session found to remove objects from.');
	}
}

/**
 * Registers the Manim cell "providers", e.g. code lenses and folding ranges.
 */
function registerManimCellProviders(context: vscode.ExtensionContext) {
	const manimCell = new ManimCell();

	const codeLensProvider = vscode.languages.registerCodeLensProvider(
		{ language: 'python' }, manimCell);
	const foldingRangeProvider = vscode.languages.registerFoldingRangeProvider(
		{ language: 'python' }, manimCell);
	context.subscriptions.push(codeLensProvider, foldingRangeProvider);

	window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			manimCell.applyCellDecorations(editor);
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		const editor = window.activeTextEditor;
		if (editor && event.document === editor.document) {
			manimCell.applyCellDecorations(editor);
		}
	}, null, context.subscriptions);

	window.onDidChangeTextEditorSelection(event => {
		manimCell.applyCellDecorations(event.textEditor);
	}, null, context.subscriptions);

	if (window.activeTextEditor) {
		manimCell.applyCellDecorations(window.activeTextEditor);
	}
}
