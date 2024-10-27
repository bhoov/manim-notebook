import * as vscode from 'vscode';
import { ManimShell } from './manimShell';
import { window } from 'vscode';

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
 * 
 * @param lineStart The line number where the scene should start. If omitted,
 * the scene will start from the current cursor position, which is the default
 * behavior when the command is invoked from the command palette.
 * This parameter is set when invoked from ManimShell in order to spawn a new
 * scene for another command at the given line number. You are probably doing
 * something wrong if you invoke this method with lineStart !== undefined
 * from somewhere else than the ManimShell.
 */
export async function startScene(lineStart?: number) {
    const editor = window.activeTextEditor;
    if (!editor) {
        window.showErrorMessage(
            'No opened file found. Please place your cursor at a line of code.'
        );
        return;
    }

    // Save active file
    vscode.commands.executeCommand('workbench.action.files.save');

    const languageId = editor.document.languageId;
    if (languageId !== 'python') {
        window.showErrorMessage("You don't have a Python file open.");
        return;
    }

    const lines = editor.document.getText().split("\n");

    // Find which lines define classes
    // E.g. here, classLines = [{ line: "class FirstScene(Scene):", index: 3 }, ...]
    const classLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /^class (.+?)\((.+?)\):/.test(line));

    let cursorLine = lineStart || editor.selection.start.line;

    // Find the first class defined before where the cursor is
    // E.g. here, matchingClass = { line: "class SelectedScene(Scene):", index: 42 }
    const matchingClass = classLines
        .reverse()
        .find(({ index }) => index <= cursorLine);
    if (!matchingClass) {
        window.showErrorMessage('Place your cursor in Manim code inside a class.');
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
    const isRequestedForAnotherCommand = (lineStart !== undefined);
    await ManimShell.instance.executeStartCommand(command, isRequestedForAnotherCommand);

    // // Commented out - in case someone would like it.
    // // For us - it would require MacOS. Also - the effect is not desired.
    // // Focus some windows (ONLY for MacOS because it uses `osascript`!)
    // const terminal = window.activeTerminal || window.createTerminal();
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
export async function exitScene() {
    const success = await ManimShell.instance.executeCommandEnsureActiveSession("exit()");
    if (success) {
        ManimShell.instance.resetActiveShell();
    } else {
        window.showErrorMessage('No active ManimGL scene found to exit.');
    }
}
