import * as vscode from 'vscode';
import { window } from 'vscode';
import { LogOutputChannel } from 'vscode';
import { waitUntilFileExists } from './fileUtil';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export const loggerName = 'Manim Notebook';

export class Logger {

    private static logger: LogOutputChannel = window.createOutputChannel(loggerName, { log: true });

    public static trace(message: string) {
        this.logger.trace(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static debug(message: string) {
        this.logger.debug(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static info(message: string) {
        this.logger.info(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static warn(message: string) {
        this.logger.warn(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static error(message: string) {
        this.logger.error(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static deactivate() {
        this.logger.dispose();
    }

    /**
     * Clears the output panel and the log file. This is necessary since clearing
     * is not performed automatically on MacOS. See issue #58.
     * 
     * @param context The extension context.
     * @param callback An optional callback function to be executed after clearing
     * the log file.
     */
    public static async clear(context: vscode.ExtensionContext, callback?: () => void) {
        // This logging statement here is important to ensure that something
        // is written to the log file, such that the file is created on disk.
        Logger.info("📜 Trying to clear logfile...");

        this.logger.clear();

        const logFilePath = vscode.Uri.joinPath(context.logUri, `${loggerName}.log`);
        try {
            await waitUntilFileExists(logFilePath.fsPath, 3000);
            Logger.info(`📜 Logfile found and cleared at ${new Date().toISOString()}`);
        } catch (error: any) {
            Logger.error(`Could not clear logfile: ${error?.message}`);
        }
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
 * Opens the Manim Notebook log file in a new editor.
 * 
 * @param context The extension context.
 */
export function recordLogFile(context: vscode.ExtensionContext) {
    const logFilePath = vscode.Uri.joinPath(context.logUri, `${loggerName}.log`);
    openLogFile(logFilePath);
}

/**
 * Tries to open the log file in an editor and reveal it in the OS file explorer.
 * 
 * @param logFilePath The URI of the log file.
 */
async function openLogFile(logFilePath: vscode.Uri) {
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

/**
 * Opens a file in the OS file explorer.
 * 
 * @param uri The URI of the file to reveal.
 */
async function revealFileInOS(uri: vscode.Uri) {
    if (vscode.env.remoteName === 'wsl') {
        await vscode.commands.executeCommand('remote-wsl.revealInExplorer', uri);
    } else {
        await vscode.commands.executeCommand('revealFileInOS', uri);
    }
}
