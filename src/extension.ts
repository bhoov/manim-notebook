import * as vscode from 'vscode';
import { window } from 'vscode';
import { ManimShell } from './manimShell';
import { ManimCell } from './manimCell';
import { ManimCellRanges } from './manimCellRanges';
import { previewCode } from './previewCode';
import { startScene } from './startScene';

export function activate(context: vscode.ExtensionContext) {

	const previewManimCellCommand = vscode.commands.registerCommand(
		'manim-notebook.previewManimCell', (cellCode?: string, startLine?: number) => {
			previewManimCell(cellCode, startLine);
		});

	const previewSelectionCommand = vscode.commands.registerCommand(
		'manim-notebook.previewSelection', () => {
			previewSelection();
		}
	);

	const startSceneCommand = vscode.commands.registerCommand(
		'manim-notebook.startScene', () => {
			startScene();
		}
	);

	const exitSceneCommand = vscode.commands.registerCommand(
		'manim-notebook.exitScene', () => {
			exitScene();
		}
	);

	const clearSceneCommand = vscode.commands.registerCommand(
		'manim-notebook.clearScene', () => {
			clearScene();
		}
	);

	context.subscriptions.push(
		previewManimCellCommand,
		previewSelectionCommand,
		startSceneCommand,
		exitSceneCommand,
		clearSceneCommand
	);
	registerManimCellProviders(context);
}

export function deactivate() { }

/**
 * Previews the Manim code of the cell where the cursor is placed
 * (when accessed via the command pallette) or the code of the cell where
 * the codelens was clicked.
 */
function previewManimCell(cellCode?: string, startLine?: number) {
	let line = startLine;

	// User has executed the command via command pallette
	if (cellCode === undefined) {
		const editor = window.activeTextEditor;
		if (!editor) {
			window.showErrorMessage(
				'No opened file found. Place your cursor in a Manim cell.');
			return;
		}
		const document = editor.document;

		// Get the code of the cell where the cursor is placed
		const cursorLine = editor.selection.active.line;
		line = cursorLine;
		const range = ManimCellRanges.getCellRangeAtLine(document, cursorLine);
		if (!range) {
			window.showErrorMessage('Place your cursor in a Manim cell.');
			return;
		}
		cellCode = document.getText(range);
	}

	if (line === undefined) {
		window.showErrorMessage('Internal error: Line number not found. Please report this bug.');
		return;
	}

	previewCode(cellCode, line);
}

/**
 * Previews the Manim code of the selected text.
 */
function previewSelection() {
	const editor = window.activeTextEditor;
	if (!editor) {
		window.showErrorMessage('Select some code to preview.');
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
		window.showErrorMessage('Select some code to preview.');
		return;
	}

	previewCode(selectedText, selection.start.line);
}

/**
 * Runs the `exit()` command in the terminal to close the animation window
 * and the IPython terminal.
 */
function exitScene() {
	ManimShell.instance.executeCommandEnsureActiveSession("exit()", () => {
		window.showErrorMessage('No active ManimGL scene found to exit.');
	}).then(() => {
		ManimShell.instance.resetActiveShell();
	});
}

/**
 * Runs the `clear()` command in the terminal to remove all objects from
 * the scene.
 */
function clearScene() {
	ManimShell.instance.executeCommandEnsureActiveSession("clear()", () => {
		window.showErrorMessage('No active ManimGL scene found to remove objects from.');
	});
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
