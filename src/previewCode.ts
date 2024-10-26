import * as vscode from 'vscode';
import { ManimShell } from './manimShell';
import { window } from 'vscode';

const PREVIEW_COMMAND = `checkpoint_paste()`;
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

        let currentSceneName: string | undefined = undefined;
        let currentProgress: number = 0;

        await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Previewing Manim",
            cancellable: false
        }, async (progress, token) => {
            progress.report({ increment: 0 });

            await ManimShell.instance.executeCommand(
                PREVIEW_COMMAND, startLine, true,
                () => restoreClipboard(clipboardBuffer),
                (data) => {
                    // TODO: Refactor (!!!)
                    // TODO: Make sure progress is reset when current command
                    // is somehow aborted, e.g. when clicking on preview
                    // while another preview is running.
                    if (!data.includes("%")) {
                        return;
                    }
                    const progressString = data.match(/\b\d{1,2}(?=\s?%)/)?.[0];
                    if (!progressString) {
                        return;
                    }

                    const newProgress = parseInt(progressString);
                    let progressIncrement = newProgress - currentProgress;

                    const split = data.split(" ");
                    if (split.length < 2) {
                        return;
                    }
                    let sceneName = data.split(" ")[1];
                    // remove last char which is a ":"
                    sceneName = sceneName.substring(0, sceneName.length - 1);
                    if (sceneName !== currentSceneName) {
                        if (currentSceneName === undefined) {
                            // Reset progress to 0
                            progressIncrement = -currentProgress;
                        }
                        currentSceneName = sceneName;
                    }

                    currentProgress = newProgress;

                    progress.report({
                        increment: progressIncrement,
                        message: sceneName
                    });
                }
            );
        });
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
