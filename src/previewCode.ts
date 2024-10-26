import * as vscode from 'vscode';
import { ManimShell } from './manimShell';
import { window } from 'vscode';
import { EventEmitter } from 'events';

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

        let currentSceneName: string | undefined = undefined;
        let currentProgress: number = 0;

        let progress: PreviewProgress | undefined;

        await ManimShell.instance.executeCommand(
            PREVIEW_COMMAND, startLine, true,
            () => {
                // Executed after command is sent to terminal
                restoreClipboard(clipboardBuffer);
                progress = new PreviewProgress();
            },
            (data) => {
                progress?.reportOnData(data);
            }
        );

        progress?.finish();

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

class PreviewProgress {
    private eventEmitter = new EventEmitter();
    private FINISH_EVENT = "finished";
    private REPORT_EVENT = "report";

    private progress: number = 0;
    private sceneName: string | undefined;

    constructor() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Previewing Manim",
            cancellable: false
        }, async (progressIndicator, token) => {
            await new Promise((resolve) => {
                this.eventEmitter.on(this.FINISH_EVENT, resolve);
                this.eventEmitter.on(this.REPORT_EVENT,
                    (data: { increment: number, message: string }) => {
                        this.progress += data.increment;
                        progressIndicator.report(
                            {
                                increment: data.increment,
                                message: data.message
                            });
                    });
            });
        });
    }

    public reportOnData(data: string) {
        const newProgress = this.extractProgressFromString(data);
        if (newProgress === -1) {
            return;
        }
        let progressIncrement = newProgress - this.progress;

        const split = data.split(" ");
        if (split.length < 2) {
            return;
        }
        let newSceneName = data.split(" ")[1];
        // remove last char which is a ":"
        newSceneName = newSceneName.substring(0, newSceneName.length - 1);
        if (newSceneName !== this.sceneName) {
            progressIncrement = -this.progress; // reset progress to 0
            this.sceneName = newSceneName;
        }

        this.eventEmitter.emit(this.REPORT_EVENT, {
            increment: progressIncrement,
            message: newSceneName
        });
    }

    public finish() {
        this.eventEmitter.emit(this.FINISH_EVENT);
    }

    private extractProgressFromString(data: string): number {
        if (!data.includes("%")) {
            return -1;
        }
        const progressString = data.match(/\b\d{1,2}(?=\s?%)/)?.[0];
        if (!progressString) {
            return -1;
        }

        return parseInt(progressString);
    }
}
