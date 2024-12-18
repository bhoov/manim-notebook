import * as vscode from 'vscode';
import { ManimShell, NoActiveShellError } from './manimShell';
import { window, workspace } from 'vscode';
import { Logger, Window } from './logger';
import { findClassLines, findManimSceneName } from './pythonParsing';
import { isAtLeastManimVersion } from './utils/version';

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
        Window.showErrorMessage(
            'No opened file found. Please place your cursor at a line of code.'
        );
        return;
    }

    await vscode.commands.executeCommand('workbench.action.files.save');

    const languageId = editor.document.languageId;
    if (languageId !== 'python') {
        Window.showErrorMessage("You don't have a Python file open.");
        return;
    }

    const lines = editor.document.getText().split("\n");
    const classLines = findClassLines(editor.document);
    let cursorLine = lineStart || editor.selection.start.line;
    const sceneClassLine = findManimSceneName(editor.document, cursorLine);
    if (!sceneClassLine) {
        Window.showErrorMessage('Place your cursor in Manim code inside a class.');
        return;
    }

    // While line is empty - make it the previous line
    // (because `manimgl -se <lineNumber>` doesn't work on empty lines)
    let lineNumber = cursorLine;
    while (lines[lineNumber].trim() === "") {
        lineNumber--;
    }

    // Create the command
    const filePath = editor.document.fileName;  // absolute path
    const cmds = ["manimgl", `"${filePath}"`, sceneClassLine.className];
    let shouldPreviewWholeScene = true;
    if (cursorLine !== sceneClassLine.lineNumber) {
        // this is actually the more common case
        shouldPreviewWholeScene = false;
        cmds.push(`-se ${lineNumber + 1}`);
    }

    // Autoreload
    if (isAtLeastManimVersion("1.7.2")) {
        const autoreload = await workspace.getConfiguration("manim-notebook").get("autoreload");
        if (autoreload) {
            cmds.push("--autoreload");
        }
    }

    const command = cmds.join(" ");

    // Run the command
    const isRequestedForAnotherCommand = (lineStart !== undefined);
    await ManimShell.instance.executeStartCommand(
        command, isRequestedForAnotherCommand, shouldPreviewWholeScene);
}

/**
 * Force-quits the active Manim session by disposing the respective VSCode
 * terminal that is currently hosting the session.
 * 
 * See `forceQuitActiveShell()` for more details.
 */
export async function exitScene() {
    try {
        ManimShell.instance.errorOnNoActiveShell();
        await ManimShell.instance.forceQuitActiveShell();
    } catch (error) {
        if (error instanceof NoActiveShellError) {
            Window.showWarningMessage("No active Manim session found to quit.");
            return;
        }
        Logger.error(`💥 Error while trying to exit the scene: ${error}`);
        throw error;
    }
}
