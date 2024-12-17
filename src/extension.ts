import * as vscode from 'vscode';
import { window } from 'vscode';
import { ManimShell, NoActiveShellError } from './manimShell';
import { ManimCell } from './manimCell';
import { previewManimCell, reloadAndPreviewManimCell, previewCode } from './previewCode';
import { ManimCellRanges } from './pythonParsing';
import { startScene, exitScene } from './startStopScene';
import { exportScene } from './export';
import { Logger, Window, LogRecorder } from './logger';
import { registerWalkthroughCommands } from './walkthrough/commands';
import { ExportSceneCodeLens } from './export';

export function activate(context: vscode.ExtensionContext) {
	// Trigger the Manim shell to start listening to the terminal
	ManimShell.instance;

	const previewManimCellCommand = vscode.commands.registerCommand(
		'manim-notebook.previewManimCell', (cellCode?: string, startLine?: number) => {
			Logger.info(`💠 Command requested: Preview Manim Cell, startLine=${startLine}`);
			previewManimCell(cellCode, startLine);
		});

	const reloadAndPreviewManimCellCommand = vscode.commands.registerCommand(
		'manim-notebook.reloadAndPreviewManimCell',
		(cellCode?: string, startLine?: number) => {
			Logger.info("💠 Command requested: Reload & Preview Manim Cell"
				+ `, startLine=${startLine}`);
			reloadAndPreviewManimCell(cellCode, startLine);
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
			await LogRecorder.recordLogFile(context);
		});

	const exportSceneCommand = vscode.commands.registerCommand(
		'manim-notebook.exportScene', async (sceneName?: string) => {
			Logger.info("💠 Command requested: Export Scene");
			await exportScene(sceneName);
		});
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ language: 'python' }, new ExportSceneCodeLens())
	);

	const openWalkthroughCommand = vscode.commands.registerCommand(
		'manim-notebook.openWalkthrough', async () => {
			Logger.info("💠 Command requested: Open Walkthrough");
			await vscode.commands.executeCommand('workbench.action.openWalkthrough',
				`${context.extension.id}#manim-notebook-walkthrough`, false);
		});

	// internal command
	const finishRecordingLogFileCommand = vscode.commands.registerCommand(
		'manim-notebook.finishRecordingLogFile', async () => {
			Logger.info("💠 Command requested: Finish Recording Log File");
			await LogRecorder.finishRecordingLogFile(context);
		});

	registerWalkthroughCommands(context);

	context.subscriptions.push(
		previewManimCellCommand,
		previewSelectionCommand,
		startSceneCommand,
		exitSceneCommand,
		clearSceneCommand,
		recordLogFileCommand,
		openWalkthroughCommand,
		exportSceneCommand,
		finishRecordingLogFileCommand,
	);
	registerManimCellProviders(context);
}

export function deactivate() {
	Logger.deactivate();
	Logger.info("💠 Manim Notebook extension deactivated");
}

/**
 * Previews the selected code.
 * 
 * - both ends of the selection automatically extend to the start and end of lines
 *   (for convenience)
 * - if Multi-Cursor selection:
 *   only the first selection is considered
 *   (TODO: make all selections be considered - expand at each selection)
 * 
 * If Manim isn't running, it will be automatically started
 * (before the first selected line).
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
 * Runs the `clear()` command in the terminal -
 * removes all objects from the scene.
 */
async function clearScene() {
	try {
		await ManimShell.instance.executeCommandErrorOnNoActiveSession("clear()");
	} catch (error) {
		if (error instanceof NoActiveShellError) {
			Window.showWarningMessage('No active Manim session found to remove objects from.');
			return;
		}
		Logger.error(`💥 Error while trying to remove objects from scene: ${error}`);
		throw error;
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
