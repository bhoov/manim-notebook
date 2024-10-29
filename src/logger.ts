import { window } from 'vscode';
import * as path from 'path';

export const loggerName = 'Manim Notebook';
const logger = window.createOutputChannel(loggerName, { log: true });

export default class Logger {

    public static trace(message: string) {
        logger.trace(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static debug(message: string) {
        logger.debug(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static info(message: string) {
        logger.info(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static warn(message: string) {
        logger.warn(`${Logger.getFormattedCallerInformation()} ${message}`);
    }

    public static error(message: string) {
        logger.error(`${Logger.getFormattedCallerInformation()} ${message}`);
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
     * where "extension.js" is the file that called the logger method
     * and "activate" is the respective method.
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

        const methodMatch = callerLine.match(/at (\w+) \(/);
        let methodName = 'unknown';
        if (methodMatch && methodMatch[1]) {
            methodName = methodMatch[1];
        }

        const fileMatch = callerLine.match(/\((.*):\d+:\d+\)/);
        let fileName = 'unknown';
        if (fileMatch && fileMatch[1]) {
            fileName = path.basename(fileMatch[1]);
        }

        return `[${fileName}] [${methodName}]`;
    }
}
