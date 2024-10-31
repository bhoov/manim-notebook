import * as vscode from 'vscode';
import { window } from 'vscode';
import { ManimShell } from './manimShell';
import { EventEmitter } from 'events';
import { Logger } from './logger';

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
 * @param startLine The line number in the active editor where the Manim session
 * should start in case a new terminal is spawned. Also see `startScene().
 */
export async function previewCode(code: string, startLine: number): Promise<void> {
    let progress: PreviewProgress | undefined;

    try {
        const clipboardBuffer = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(code);

        await ManimShell.instance.executeCommand(
            PREVIEW_COMMAND, startLine, true, {
            onCommandIssued: (shellStillExists) => {
                Logger.debug(`📊 Command issued: ${PREVIEW_COMMAND}. Will restore clipboard`);
                restoreClipboard(clipboardBuffer);
                if (shellStillExists) {
                    Logger.debug("📊 Initializing preview progress");
                    progress = new PreviewProgress();
                } else {
                    Logger.debug("📊 Shell was closed in the meantime, not showing progress");
                }
            },
            onData: (data) => {
                progress?.reportOnData(data);
            },
            onReset: () => {
                progress?.finish();
            }
        });
    } finally {
        progress?.finish();
    }
}

/**
 * Restores the clipboard content after a user-defined timeout.
 * 
 * @param clipboardBuffer The content to restore.
 */
function restoreClipboard(clipboardBuffer: string) {
    const timeout = vscode.workspace.getConfiguration("manim-notebook").clipboardTimeout;
    setTimeout(async () => {
        await vscode.env.clipboard.writeText(clipboardBuffer);
    }, timeout);
}

/**
 * Class to handle the progress notification of the preview code command.
 */
class PreviewProgress {
    private eventEmitter = new EventEmitter();
    private FINISH_EVENT = "finished";
    private REPORT_EVENT = "report";

    /**
     * Current progress of the preview command.
     */
    private progress: number = 0;

    /**
     * Name of the animation being previewed.
     */
    private animationName: string | undefined;

    constructor() {
        window.withProgress({
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

    /**
     * Updates the progress based on the given Manim preview output.
     * E.g. `2 ShowCreationNumberPlane, etc.:   7%| 2  /30  16.03it/s`
     * 
     * @param data The Manim preview output to parse.
     */
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
        let newAnimName = data.split(" ")[1];
        // remove last char which is a ":"
        newAnimName = newAnimName.substring(0, newAnimName.length - 1);
        if (newAnimName !== this.animationName) {
            progressIncrement = -this.progress; // reset progress to 0
            this.animationName = newAnimName;
        }

        Logger.debug(`📊 Progress: ${this.progress} -> ${newProgress} (${progressIncrement})`);

        this.eventEmitter.emit(this.REPORT_EVENT, {
            increment: progressIncrement,
            message: newAnimName
        });
    }

    /**
     * Finishes the progress notification, i.e. closes the progress bar.
     */
    public finish() {
        Logger.debug("📊 Finishing progress notification");
        this.eventEmitter.emit(this.FINISH_EVENT);
    }

    /**
     * Extracts the progress information from the given Manim preview output.
     * 
     * @param data The Manim preview output to parse.
     * @returns The progress percentage as in the interval [0, 100],
     * or -1 if no progress information was found.
     */
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
