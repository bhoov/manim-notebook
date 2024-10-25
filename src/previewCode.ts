import * as vscode from 'vscode';
import { ManimShell } from './manimShell';
import { window } from 'vscode';

const PREVIEW_COMMAND = `\x0C checkpoint_paste()\x1b`;
// \x0C: is Ctrl + L
// \x1b: https://github.com/bhoov/manim-notebook/issues/18#issuecomment-2431146809

/**
 * Whether the extension is currently executing a Manim command.
 * 
 * Note that this is not capturing whether the `checkpoint_paste()` command is
 * still running. Instead, it only captures whether reading/writing to clipboard
 * is currently happening to prevent unpredictable behavior.
 * 
 * We don't need to capture the state of `checkpoint_paste()` because users
 * might actually want to preview a cell (or another one) again from the start
 * even though the animation is still running. With the new VSCode terminal
 * shell integration, it will automatically send a `Ctrl + C` to the terminal
 * when a new command is sent, so the previous command will be interrupted.
 */
let isExecuting = false;

/**
 * Interactively previews the given Manim code by means of the
 * `checkpoint_paste()` method from Manim.
 * 
 * This workflow is described in [1] and was adapted from Sublime to VSCode by
 * means of this extension. The main features are discussed in [2]. A demo
 * is shown in the video "How I animate 3Blue1Brown" by Grant Sanderson [3],
 * with the workflow being showcased between 3:32 and 6:48.
 * 
 * [1] https://github.com/3b1b/videos#workflow
 * [2] https://github.com/ManimCommunity/manim/discussions/3954#discussioncomment-10933720
 * [3] https://youtu.be/rbu7Zu5X1zI
 *
 * @param code The code to preview (e.g. from a Manim cell or from a custom selection).
 */
export async function previewCode(code: string, startLine: number): Promise<void> {
    if (isExecuting) {
        vscode.window.showInformationMessage('Please wait a few seconds, then try again.');
        return;
    }
    isExecuting = true;

    try {
        const clipboardBuffer = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(code);

        ManimShell.instance.executeCommand(PREVIEW_COMMAND, startLine);

        // Restore original clipboard content
        const timeout = vscode.workspace.getConfiguration("manim-notebook").clipboardTimeout;
        setTimeout(async () => {
            await vscode.env.clipboard.writeText(clipboardBuffer);
        }, timeout);
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
    } finally {
        isExecuting = false;
    }
}
