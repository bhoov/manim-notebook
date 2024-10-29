import { window } from 'vscode';
import { LogOutputChannel } from 'vscode';
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
