import * as vscode from 'vscode';
import { ManimShell } from './manimShell';
import { ManimCell } from './manimCell';
import { ManimCellRanges } from './manimCellRanges';
import { previewCode } from './previewCode';
import { executeTerminalCommand } from './executeTerminalCommand';

export function activate(context: vscode.ExtensionContext) {

	const previewManimCellCommand = vscode.commands.registerCommand(
		'manim-notebook.previewManimCell', (cellCode: string | undefined) => {
			previewManimCell(cellCode);
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

	const shell = new ManimShell();
}

export function deactivate() { }

/**
 * Previews the Manim code of the cell where the cursor is placed
 * (when accessed via the command pallette) or the code of the cell where
 * the codelens was clicked.
 */
function previewManimCell(cellCode: string | undefined) {
	// User has executed the command via command pallette
	if (cellCode === undefined) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage(
				'No opened file found. Place your cursor in a Manim cell.');
			return;
		}
		const document = editor.document;

		// Get the code of the cell where the cursor is placed
		const cursorLine = editor.selection.active.line;
		const range = ManimCellRanges.getCellRangeAtLine(document, cursorLine);
		if (!range) {
			vscode.window.showErrorMessage('Place your cursor in a Manim cell.');
			return;
		}
		cellCode = document.getText(range);
	}

	previewCode(cellCode);
}

/**
 * Previews the Manim code of the selected text.
 */
function previewSelection() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('Select some code to preview.');
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
		vscode.window.showErrorMessage('Select some code to preview.');
		return;
	}

	previewCode(selectedText);
}

/**
 * Runs the `manimgl` command in the terminal, with the current cursor's line number:
 * manimgl <file_name> <ClassName> [-se <lineNumber>]
 * 
 * - Saves the active file.
 * - Previews the scene at the cursor's line (end of line)
 * - If the cursor is on a class definition line, then `-se <lineNumber>`
 *   is NOT added, i.e. the whole scene is previewed.
 * - (3b1b's version also copies this command to the clipboard with additional
 *   args `--prerun --finder -w`. We don't do that here.)
 */
async function startScene() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage(
			'No opened file found. Please place your cursor at a line of code.'
		);
		return;
	}

	// Save active file
	vscode.commands.executeCommand('workbench.action.files.save');

	const languageId = editor.document.languageId;
	if (languageId !== 'python') {
		vscode.window.showErrorMessage("You don't have a Python file open.");
		return;
	}

	const lines = editor.document.getText().split("\n");

	// Find which lines define classes
	// E.g. here, classLines = [{ line: "class FirstScene(Scene):", index: 3 }, ...]
	const classLines = lines
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => /^class (.+?)\((.+?)\):/.test(line));

	const cursorLine = editor.selection.start.line;

	// Find the first class defined before where the cursor is
	// E.g. here, matchingClass = { line: "class SelectedScene(Scene):", index: 42 }
	const matchingClass = classLines
		.reverse()
		.find(({ index }) => index <= cursorLine);
	if (!matchingClass) {
		vscode.window.showErrorMessage('Place your cursor in Manim code inside a class.');
		return;
	}
	// E.g. here, sceneName = "SelectedScene"
	const sceneName = matchingClass.line.slice("class ".length, matchingClass.line.indexOf("("));

	// While line is empty - make it the previous line
	// (because `manimgl -se <lineNumber>` doesn't work on empty lines)
	let lineNumber = cursorLine;
	while (lines[lineNumber].trim() === "") {
		lineNumber--;
	}

	// Create the command
	const filePath = editor.document.fileName;  // absolute path
	const cmds = ["manimgl", filePath, sceneName];
	let enter = false;
	if (cursorLine !== matchingClass.index) {
		cmds.push(`-se ${lineNumber + 1}`);
		enter = true;
	}
	const command = cmds.join(" ");

	// // Commented out - in case someone would like it.
	// // For us - we want to NOT overwrite our clipboard.
	// // If one wants to run it in a different terminal,
	// // it's often to write to a file
	// await vscode.env.clipboard.writeText(command + " --prerun --finder -w");

	// Run the command
	executeTerminalCommand(command);

	// // Commented out - in case someone would like it.
	// // For us - it would require MacOS. Also - the effect is not desired.
	// // Focus some windows (ONLY for MacOS because it uses `osascript`!)
	// const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
	// if (enter) {
	// 	// Keep cursor where it started (in VSCode)
	// 	const cmd_focus_vscode = 'osascript -e "tell application \\"Visual Studio Code\\" to activate"';
	// 	// Execute the command in the shell after a delay (to give the animation window enough time to open)
	// 	await new Promise(resolve => setTimeout(resolve, 2500));
	// 	require('child_process').exec(cmd_focus_vscode);
	// } else {
	// 	terminal.show();
	// }
}

/**
 * Runs the `exit()` command in the terminal to close the animation window
 * and the IPython terminal.
 */
function exitScene() {
	executeTerminalCommand("exit()");
}

/**
 * Runs the `clear()` command in the terminal to remove all objects from
 * the scene.
 */
function clearScene() {
	executeTerminalCommand("clear()");
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

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			manimCell.applyCellDecorations(editor);
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) {
			manimCell.applyCellDecorations(editor);
		}
	}, null, context.subscriptions);

	vscode.window.onDidChangeTextEditorSelection(event => {
		manimCell.applyCellDecorations(event.textEditor);
	}, null, context.subscriptions);

	if (vscode.window.activeTextEditor) {
		manimCell.applyCellDecorations(vscode.window.activeTextEditor);
	}
}
