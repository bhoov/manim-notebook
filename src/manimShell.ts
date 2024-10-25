import * as vscode from 'vscode';
import { window } from 'vscode';
import { startScene } from './startScene';

// https://stackoverflow.com/a/14693789/
const ANSI_CONTROL_SEQUENCE_REGEX = /(?:\x1B[@-Z\\-_]|[\x80-\x9A\x9C-\x9F]|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~])/g;
const MANIM_WELCOME_STRING = "ManimGL";

/**
 * TODO Description.
 * 
 * Note that shell is used as synonym for "terminal" here.
 */
export class ManimShell {
    // for use with singleton pattern
    static #instance: ManimShell;

    // At the moment assume that there is only one shell that executes ManimGL
    private activeShell: vscode.Terminal | null = null;


    private constructor() {
        this.initiateActiveShellSearching();
    }

    public static get instance(): ManimShell {
        if (!ManimShell.#instance) {
            ManimShell.#instance = new ManimShell();
        }
        return ManimShell.#instance;
    }

    /**
     * Executes the given command in the VSCode terminal:
     * - either using shell integration (if supported),
     * - otherwise using `sendText`.
     * 
     * If no active terminal running Manim is found, a new terminal is created.
     * 
     * @param command The command to execute in the VSCode terminal.
     */
    public async executeCommand(command: string, startLine?: number): Promise<void> {
        const shell = await this.retrieveActiveShell(startLine);

        // See the new Terminal shell integration API (from VSCode release 1.93)
        // https://code.visualstudio.com/updates/v1_93#_terminal-shell-integration-api
        if (shell.shellIntegration) {
            shell.shellIntegration.executeCommand(command);
        } else {
            shell.sendText(command);
        }
    }

    private async retrieveActiveShell(startLine?: number): Promise<vscode.Terminal> {
        if (this.activeShell === null || this.activeShell.exitStatus !== undefined) {
            console.log("❌ Active shell is null");
            this.activeShell = vscode.window.createTerminal();
            startScene(startLine);
            await new Promise(resolve => setTimeout(resolve, 5000));

        }
        console.log(`✅ Active shell: ${this.activeShell}`);
        return this.activeShell;
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
