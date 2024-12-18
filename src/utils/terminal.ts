import * as vscode from 'vscode';
import { window } from 'vscode';

/**
 * Waits a user-defined delay before allowing the terminal to be used. This 
 * might be useful for some activation scripts to load like virtualenvs etc.
 * 
 * Note that this function must be awaited by the caller, otherwise the delay
 * will not be respected.
 * 
 * This function does not have any reference to the actual terminal, it just
 * waits, and that's it.
 */
export async function waitNewTerminalDelay() {
    const delay: number = await vscode.workspace
        .getConfiguration("manim-notebook").get("delayNewTerminal")!;

    if (delay > 600) {
        await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Waiting a user-defined delay for the new terminal...",
            cancellable: false
        }, async (progress, token) => {
            progress.report({ increment: 0 });

            // split user-defined timeout into 500ms chunks and show progress
            const numChunks = Math.ceil(delay / 500);
            for (let i = 0; i < numChunks; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));
                progress.report({ increment: 100 / numChunks });
            }
        });
    } else {
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

/**
 * Regular expression to match ANSI control sequences. Even though we might miss
 * some control sequences, this is good enough for our purposes as the relevant
 * ones are matched. From: https://stackoverflow.com/a/14693789/
 */
const ANSI_CONTROL_SEQUENCE_REGEX = /(?:\x1B[@-Z\\-_]|[\x80-\x9A\x9C-\x9F]|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~])/g;

/**
 * Removes ANSI control codes from the given stream of strings and yields the
 * cleaned strings.
 * 
 * @param stream The stream of strings to clean.
 * @returns An async iterable stream of strings without ANSI control codes.
 */
export async function* withoutAnsiCodes(stream: AsyncIterable<string>) {
    for await (const data of stream) {
        yield data.replace(ANSI_CONTROL_SEQUENCE_REGEX, '');
    }
}
