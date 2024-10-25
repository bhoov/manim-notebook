import * as vscode from 'vscode';
import { window } from 'vscode';

// https://stackoverflow.com/a/14693789/
const ANSI_CONTROL_SEQUENCE_REGEX = /(?:\x1B[@-Z\\-_]|[\x80-\x9A\x9C-\x9F]|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~])/g;
const MANIM_WELCOME_STRING = "ManimGL";

export class ManimShell {
    // At the moment assume that there is only one shell that executes ManimGL
    private activeShell: vscode.Terminal | null = null;

    constructor() {
        this.initiateActiveShellSearching();
    }

    /**
     * Continuously searches for the active shell that executes ManimGL.
     */
    private initiateActiveShellSearching() {
        window.onDidStartTerminalShellExecution(
            async (event: vscode.TerminalShellExecutionStartEvent) => {
                const stream = event.execution.read();
                for await (const data of withoutAnsiCodes(stream)) {
                    console.log(`🎧: ${data}`);
                    if (data.includes(MANIM_WELCOME_STRING)) {
                        this.activeShell = event.terminal;
                    }
                }
            });

        window.onDidEndTerminalShellExecution(async (event: vscode.TerminalShellExecutionEndEvent) => {
            console.log('🔎 onDidEndTerminalShellExecution', event);
        });
    }

}

async function* withoutAnsiCodes(stream: AsyncIterable<string>) {
    for await (const data of stream) {
        yield stripAnsiCodes(data);
    }
}

function stripAnsiCodes(str: string) {
    return str.replace(ANSI_CONTROL_SEQUENCE_REGEX, '');
}
