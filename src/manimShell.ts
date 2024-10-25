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
 * Wrapper around the IPython terminal that ManimGL uses. Ensures that commands
 * are executed at the right place and spans a new Manim session if necessary.
 * 
 * The words "shell" and "terminal" are used interchangeably.
 * 
 * This class is a singleton and should be accessed via `ManimShell.instance`.
 */
export class ManimShell {
    static #instance: ManimShell;

    private activeShell: vscode.Terminal | null = null;
    private eventEmitter = new EventEmitter();
    private detectShellExecutionEnd = true;

    private constructor() {
        this.initiateTerminalDataReading();
    }

    public static get instance(): ManimShell {
        if (!ManimShell.#instance) {
            ManimShell.#instance = new ManimShell();
        }
        return ManimShell.#instance;
    }

    /**
     * Resets the active shell such that a new terminal is created on the next
     * command execution.
     */
    public resetActiveShell() {
        this.activeShell = null;
    }

    /**
     * Executes the given command in the VSCode terminal:
     * - either using shell integration (if supported),
     * - otherwise using `sendText`.
     * 
     * If no active terminal running Manim is found, a new terminal is spawned,
     * and a new Manim session is started in it.
     * 
     * Even though this method is asynchronous, it does only wait for the initial
     * setup of the terminal and the creation of the Manim session, but NOT for
     * the end of the actual command execution. That is, it will return before
     * the actual command has finished executing.
     * 
     * @param command The command to execute in the VSCode terminal.
     * @param startLine The line number in the active editor where the Manim
     * session should start in case a new terminal is spawned. See `startScene`
     * for 
     */
    public async executeCommand(command: string, startLine?: number) {
        console.log(`🙌 Executing command: ${command}, startLine: ${startLine}`);
        const clipboardBuffer = await vscode.env.clipboard.readText();
        const shell = await this.retrieveOrInitActiveShell(startLine);
        this.exec(shell, command);
        await vscode.env.clipboard.writeText(clipboardBuffer);
    }

    /**
     * Executes the given command, but only if an active ManimGL shell exists.
     * If not, the given callback is executed.
     * 
     * @param command The command to execute in the VSCode terminal.
     * @param onNoActiveSession Callback to execute if no active ManimGL shell
     * exists.
     * @returns A promise that resolves when the command could be successfully
     * started. Note that this is NOT the point when the command execution finishes.
     */
    public async executeCommandEnsureActiveSession(
        command: string, onNoActiveSession: () => void): Promise<void> {
        if (this.activeShell === null) {
            onNoActiveSession();
            return Promise.reject();
        }
        this.exec(this.activeShell, command);
        return Promise.resolve();
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

    /**
     * Executes the command in the shell using shell integration if available,
     * otherwise using `sendText`.
     * 
     * This method is NOT asynchronous by design, as Manim commands run in the
     * IPython terminal that the VSCode API does not natively support. I.e.
     * the event does not actually end, when the command has finished running,
     * since we are still in the IPython environment.
     * 
     * Note that this does not hold true for the initial setup of the terminal
     * and the first `checkpoint_paste()` call, which is why we disable the
     * detection of the "shell execution end" when while the commands are
     * issued.
     * 
     * @param shell The shell to execute the command in.
     * @param command The command to execute in the shell.
     */
    private exec(shell: vscode.Terminal, command: string) {
        this.detectShellExecutionEnd = false;
        if (shell.shellIntegration) {
            shell.shellIntegration.executeCommand(command);
        } else {
            shell.sendText(command);
        }
        this.detectShellExecutionEnd = true;
    }

    /**
     * Retrieves the active shell or spawns a new one if no active shell can
     * be found. If a new shell is spawned, the Manim session is started at the
     * given line.
     * 
     * A shell that was previously used to run Manim, but has exited from the
     * Manim session (IPython environment), is considered inactive.
     * 
     * @param startLine The line number in the active editor where the Manim
     * session should start in case a new terminal is spawned.
     * Also see: `startScene()`.
     */
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
                if (!this.detectShellExecutionEnd) {
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
