import * as vscode from 'vscode';
import { ManimShell } from './manimShell';
import { window } from 'vscode';

const PREVIEW_COMMAND = `\x0C checkpoint_paste()\x1b`;
// \x0C: is Ctrl + L
// \x1b: https://github.com/bhoov/manim-notebook/issues/18#issuecomment-2431146809

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
    try {
        const clipboardBuffer = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(code);

        await ManimShell.instance.executeCommand(
            PREVIEW_COMMAND, startLine, true, {
            onCommandIssued: () => {
                restoreClipboard(clipboardBuffer);
            }
        }
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
    }
}

function restoreClipboard(clipboardBuffer: string) {
    const timeout = vscode.workspace.getConfiguration("manim-notebook").clipboardTimeout;
    setTimeout(async () => {
        await vscode.env.clipboard.writeText(clipboardBuffer);
    }, timeout);
}
