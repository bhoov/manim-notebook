import * as vscode from 'vscode';
import { window } from 'vscode';
import { startScene } from './startScene';
import { EventEmitter } from 'events';

// https://stackoverflow.com/a/14693789/
const ANSI_CONTROL_SEQUENCE_REGEX = /(?:\x1B[@-Z\\-_]|[\x80-\x9A\x9C-\x9F]|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~])/g;
const IPYTHON_CELL_START_REGEX = /^\s*In \[\d+\]:/m;
const ERROR_REGEX = /^\s*Cell In\[\d+\],\s*line\s*\d+/m;
const MANIM_WELCOME_STRING = "ManimGL";

enum ManimShellEvent {
    IPYTHON_CELL_FINISHED = 'ipythonCellFinished',
}

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
    private eventEmitter = new EventEmitter();
    private detectShellExit = true;


    private constructor() {
        this.initiateTerminalDataReading();
    }

    public static get instance(): ManimShell {
        if (!ManimShell.#instance) {
            ManimShell.#instance = new ManimShell();
        }
        return ManimShell.#instance;
    }

    public resetActiveShell() {
        this.activeShell = null;
    }

    /**
     * Executes the given command in the VSCode terminal:
     * - either using shell integration (if supported),
     * - otherwise using `sendText`.
     * 
     * If no active terminal running Manim is found, a new terminal is created.
     * 
     * The actual command execution is not awaited for.
     * 
     * @param command The command to execute in the VSCode terminal.
     */
    public async executeCommand(command: string, startLine?: number) {
        console.log(`🙌 Executing command: ${command}, startLine: ${startLine}`);
        const clipboardBuffer = await vscode.env.clipboard.readText();

        const shell = await this.retrieveOrInitActiveShell(startLine);

        this.detectShellExit = false;
        if (shell.shellIntegration) {
            shell.shellIntegration.executeCommand(command);
        } else {
            shell.sendText(command);
        }
        this.detectShellExit = true;

        await vscode.env.clipboard.writeText(clipboardBuffer);
    }

    /**
     * Executes the given command and waits for the IPython cell to finish.
     *
     * @param command The command to execute in the VSCode terminal.
     */
    public async executeCommandAndWait(command: string) {
        this.executeCommand(command);
        await new Promise(resolve => {
            this.eventEmitter.once(ManimShellEvent.IPYTHON_CELL_FINISHED, resolve);
        });
    }

    private async retrieveOrInitActiveShell(startLine?: number): Promise<vscode.Terminal> {
        if (this.activeShell === null || this.activeShell.exitStatus !== undefined) {
            this.activeShell = vscode.window.createTerminal();
            await startScene(startLine);
        }
        return this.activeShell;
    }

    /**
     * Continuously searches for the active shell that executes ManimGL.
     */
    private initiateTerminalDataReading() {
        window.onDidStartTerminalShellExecution(
            async (event: vscode.TerminalShellExecutionStartEvent) => {
                const stream = event.execution.read();
                for await (const data of withoutAnsiCodes(stream)) {
                    console.log(`🎧: ${data}`);
                    if (data.includes(MANIM_WELCOME_STRING)) {
                        this.activeShell = event.terminal;
                    }
                    if (data.match(IPYTHON_CELL_START_REGEX)) {
                        this.eventEmitter.emit(ManimShellEvent.IPYTHON_CELL_FINISHED);
                    }
                    if (data.match(ERROR_REGEX)) {
                        this.activeShell?.show();
                    }
                }
            });

        window.onDidEndTerminalShellExecution(
            async (event: vscode.TerminalShellExecutionEndEvent) => {
                if (!this.detectShellExit) {
                    return;
                }
                if (event.terminal === this.activeShell) {
                    this.resetActiveShell();
                }
            });
    }
}

async function* withoutAnsiCodes(stream: AsyncIterable<string>) {
    for await (const data of stream) {
        yield data.replace(ANSI_CONTROL_SEQUENCE_REGEX, '');
    }
}
