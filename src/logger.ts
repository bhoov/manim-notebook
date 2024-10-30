import * as vscode from 'vscode';
import { window } from 'vscode';
import { LogOutputChannel } from 'vscode';
import { waitUntilFileExists, revealFileInOS } from './fileUtil';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const LOGGER_NAME = 'Manim Notebook';

export class Logger {

    public static isRecording = false;

    private static logger: LogOutputChannel = window.createOutputChannel(
        LOGGER_NAME, { log: true });

    public static trace(message: string) {
        if (!this.isRecording) {
            return;
        }
        this.logger.trace(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static debug(message: string) {
        if (!this.isRecording) {
            return;
        }
        this.logger.debug(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static info(message: string) {
        if (!this.isRecording) {
            return;
        }
        this.logger.info(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static warn(message: string) {
        if (!this.isRecording) {
            return;
        }
        this.logger.warn(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static error(message: string) {
        if (!this.isRecording) {
            return;
        }
        this.logger.error(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static deactivate() {
        this.logger.dispose();
    }

    /**
     * Clears the output panel and the log file. This is necessary since clearing
     * is not performed automatically on MacOS. See issue #58.
     * 
     * @param logFilePath The URI of the log file.
     */
    public static async clear(logFilePath: vscode.Uri) {
        // This logging statement here is important to ensure that something
        // is written to the log file, such that the file is created on disk.
        Logger.info("📜 Trying to clear logfile...");

        this.logger.clear();

        await waitUntilFileExists(logFilePath.fsPath, 3000);
        await fs.writeFileSync(logFilePath.fsPath, '');
        Logger.info(`📜 Logfile found and cleared at ${new Date().toISOString()}`);
    }

    public static logSystemInformation() {
        Logger.info(`Operating system: ${os.type()} ${os.release()} ${os.arch()}`);
        Logger.info(`Process versions: ${JSON.stringify(process.versions)}`);

        try {
            const packageJsonPath = path.join(__dirname, '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            Logger.info(`Manim notebook version: ${packageJson.version}`);
        } catch (error: Error | unknown) {
            Logger.error("Could not determine Manim notebook version used");
            try {
                Logger.error(String(error));
            } catch {
                Logger.error("(Unable to stringify the error message)");
                // in this case we will still record the log session
            }
        }

        Logger.info("--------------------------");
    }

    /**
     * Returns formatted caller information in the form of
     * "[filename] [methodname]".
     * 
     * It works by creating a stack trace and extracting the file name from the
     * third line of the stack trace, e.g.
     * 
     * Error:
     *      at Logger.getCurrentFileName (manim-notebook/out/logger.js:32:19)
     *      at Logger.info (manim-notebook/out/logger.js:46:39)
     *      at activate (manim-notebook/out/extension.js:37:21)
     * ...
     * 
     * where "extension.js:37:21" is the file that called the logger method
     * and "activate" is the respective method.
     * 
     * Another example where the Logger is called in a Promise might be:
     * 
     * Error:
     *     at Function.getFormattedCallerInformation (manim-notebook/src/logger.ts:46:23)
     *     at Function.info (manim-notebook/src/logger.ts:18:31)
     *     at manim-notebook/src/extension.ts:199:12
     * 
     * where "extension.ts:199:12" is the file that called the logger method
     * and the method is unknown.
     */
    private static getFormattedCallerInformation(): string {
        const error = new Error();
        const stack = error.stack;

        const unknownString = "[unknown] [unknown]";

        if (!stack) {
            return unknownString;
        }

        const stackLines = stack.split('\n');
        if (stackLines.length < 4) {
            return unknownString;
        }

        const callerLine = stackLines[3];
        if (!callerLine) {
            return unknownString;
        }

        const fileMatch = callerLine.match(/(?:[^\(\s])*?:\d+:\d+/);
        let fileName = 'unknown';
        if (fileMatch && fileMatch[0]) {
            fileName = path.basename(fileMatch[0]);
        }

        const methodMatch = callerLine.match(/at (\w+) \(/);
        let methodName = 'unknown';
        if (methodMatch && methodMatch[1]) {
            methodName = methodMatch[1];
        }

        return `[${fileName}] [${methodName}]`;
    }
}

/**
 * Class that wraps some VSCode window methods to log the messages before
 * displaying them to the user as a notification.
 */
export class Window {

    public static showInformationMessage(message: string) {
        Logger.info(`💡 ${message}`);
        window.showInformationMessage(message);
    }

    public static showWarningMessage(message: string, ...items: string[]) {
        Logger.warn(`💡 ${message}`);
        window.showWarningMessage(message, ...items);
    }

    public static showErrorMessage(message: string) {
        Logger.error(`💡 ${message}`);
        window.showErrorMessage(message);
    }
}

/**
 * Class to manage the recording of a log file. Users can start and stop the
 * recording of a log file. The log file is then opened in the file explorer
 * afterwards such that they can just drag-and-drop it into a new GitHub issue.
 */
export class LogRecorder {

    private static recorderStatusBar: vscode.StatusBarItem;

    /**
     * Starts recording a log file.
     * 
     * @param context The extension context.
     */
    public static async recordLogFile(context: vscode.ExtensionContext) {
        if (Logger.isRecording) {
            window.showInformationMessage("A log file is already being recorded.");
            return;
        }

        let isClearSuccessful = false;

        await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Setting everything up for Log recording...",
            cancellable: false
        }, async (progressIndicator, token) => {
            try {
                await Logger.clear(this.getLogFilePath(context));
                isClearSuccessful = true;
            } catch (error: any) {
                window.showErrorMessage(`Try to reload your VSCode window, then try again.`
                    + ` We were not able to set up a log file: ${error?.message}`);
            }
        });

        if (!isClearSuccessful) {
            return;
        }

        this.recorderStatusBar = window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.recorderStatusBar.text = `$(stop-circle) Click to finish recording log file`;
        this.recorderStatusBar.command = "manim-notebook.finishRecordingLogFile";
        this.recorderStatusBar.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.errorBackground');

        Logger.isRecording = true;
        Logger.info("📜 Logfile recording started");
        Logger.logSystemInformation();
        this.recorderStatusBar.show();
    }

    /**
     * Finished the active recording of a log file. Called when the user
     * clicks on the status bar item.
     * 
     * @param context The extension context.
     */
    public static async finishRecordingLogFile(context: vscode.ExtensionContext) {
        Logger.isRecording = false;
        this.recorderStatusBar.dispose();

        await this.openLogFile(this.getLogFilePath(context));
    }

    /**
     * Returns the URI of the log file that VSCode initializes for us.
     * 
     * @param context The extension context.
     */
    private static getLogFilePath(context: vscode.ExtensionContext): vscode.Uri {
        return vscode.Uri.joinPath(context.logUri, `${LOGGER_NAME}.log`);
    }

    /**
     * Tries to open the log file in an editor and reveal it in the OS file explorer.
     * 
     * @param logFilePath The URI of the log file.
     */
    private static async openLogFile(logFilePath: vscode.Uri) {
        await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Opening Manim Notebook log file...",
            cancellable: false
        }, async (progressIndicator, token) => {
            await new Promise<void>(async (resolve) => {
                try {
                    const doc = await vscode.workspace.openTextDocument(logFilePath);
                    await window.showTextDocument(doc);
                    await revealFileInOS(logFilePath);
                } catch (error: any) {
                    window.showErrorMessage(`Could not open Manim Notebook log file:`
                        + ` ${error?.message}`);
                } finally {
                    resolve();
                }
            });
        });
    }

}
