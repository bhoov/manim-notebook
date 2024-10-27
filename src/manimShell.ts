import * as vscode from 'vscode';
import { window } from 'vscode';
import { Terminal } from 'vscode';
import { startScene, exitScene } from './startStopScene';
import { EventEmitter } from 'events';

/**
 * Regular expression to match ANSI control sequences. Even though we might miss
 * some control sequences, this is good enough for our purposes as the relevant
 * ones are matched. From: https://stackoverflow.com/a/14693789/
 */
const ANSI_CONTROL_SEQUENCE_REGEX = /(?:\x1B[@-Z\\-_]|[\x80-\x9A\x9C-\x9F]|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~])/g;

/**
 * Regular expression to match the start of an IPython cell, e.g. "In [5]:"
 */
const IPYTHON_CELL_START_REGEX = /^\s*In \[\d+\]:/m;

/**
 * Regular expression to match an error message in the terminal. For any error
 * message, IPython prints "Cell In[<number>], line <number>" to a new line.
 */
const ERROR_REGEX = /^\s*Cell In\[\d+\],\s*line\s*\d+/m;

/**
 * Regular expression to match the welcome string that ManimGL prints when the
 * interactive session is started, e.g. "ManimGL v1.7.1". This is used to detect
 * if the terminal is related to ManimGL.
 */
const MANIM_WELCOME_REGEX = /^\s*ManimGL/m;

enum ManimShellEvent {
    /**
     * Event emitted when an IPython cell has finished executing, i.e. when the
     * IPYTHON_CELL_START_REGEX is matched.
     */
    IPYTHON_CELL_FINISHED = 'ipythonCellFinished',
}

/**
 * Event handler for command execution events.
 */
export interface CommandExecutionEventHandler {
    /**
     * Callback that is invoked when the command is issued, i.e. sent to the
     * terminal. At this point, the command is probably not yet finished
     * executing.
     */
    onCommandIssued?: () => void;
}

/**
 * Error thrown when no active shell is found, but an active shell is required
 * for the command execution.
 */
export class NoActiveShellError extends Error { }

/**
 * Wrapper around the IPython terminal that ManimGL uses. Ensures that commands
 * are executed at the right place and spans a new Manim session if necessary.
 * 
 * The words "shell" and "terminal" are used interchangeably. "ManimShell" refers
 * to a VSCode terminal that has a ManimGL IPython session running. The notion
 * of "just a terminal", without a running Manim session, is not needed, as we
 * always ensure that commands are run inside an active Manim session.
 * 
 * This class is a singleton and should be accessed via `ManimShell.instance`.
 */
export class ManimShell {
    static #instance: ManimShell;

    private activeShell: Terminal | null = null;
    private eventEmitter = new EventEmitter();

    /**
     * Whether the execution of a new command is locked. This is used to prevent
     * multiple new scenes from being started at the same time, e.g. when users
     * click on "Preview Manim Cell" multiple times in quick succession.
     */
    private lockDuringStartup = false;

    /**
     * Whether to lock the execution of a new command while another command is
     * currently running. On MacOS, we do lock since the IPython terminal *exits*
     * when sending Ctrl+C instead of just interrupting the current command.
     * See issue #16: https://github.com/bhoov/manim-notebook/issues/16
     */
    private shouldLockDuringCommandExecution = false;
    private isExecutingCommand = false;

    /**
     * Whether to detect the end of a shell execution.
     * 
     * We disable this while programmatically executing commands in the shell
     * (over the whole duration of the command execution) since we only want to
     * detect user-triggered "shell execution ends". The only such event is
     * when the user somehow exists the IPython shell (e.g. Ctrl + D) or typing
     * exit() etc. A "shell execution end" is not triggered when they run a
     * command manually inside the active Manim session.
     * 
     * If the user invokes the exit() command via the command pallette, we
     * also reset the active shell.
     */
    private detectShellExecutionEnd = true;

    private constructor() {
        this.initiateTerminalDataReading();

        // on MacOS
        if (process.platform === "darwin") {
            this.shouldLockDuringCommandExecution = true;
        }
    }

    public static get instance(): ManimShell {
        if (!ManimShell.#instance) {
            ManimShell.#instance = new ManimShell();
        }
        return ManimShell.#instance;
    }

    /**
     * Executes the given command. If no active terminal running Manim is found,
     * a new terminal is spawned, and a new Manim session is started in it
     * before executing the given command.
     * 
     * This command is locked during startup to prevent multiple new scenes from
     * being started at the same time, see `lockDuringStartup`.
     * 
     * For params explanations, see the docs for `execCommand()`.
     */
    public async executeCommand(
        command: string, startLine: number, waitUntilFinished = false,
        handler?: CommandExecutionEventHandler
    ) {
        await this.execCommand(
            command, waitUntilFinished, false, false, startLine, handler);
    }

    /**
     * Executes the given command, but only if an active ManimGL shell exists.
     * Otherwise throws a `NoActiveShellError`.
     * 
     * For params explanations, see the docs for `execCommand()`.
     * @throws NoActiveShellError If no active shell is found.
     */
    public async executeCommandErrorOnNoActiveSession(
        command: string, waitUntilFinished = false, forceExecute = false
    ) {
        await this.execCommand(
            command, waitUntilFinished, forceExecute, true, undefined, undefined);
    }

    /**
     * Executes a given command and bundles many different behaviors and options.
     * 
     * This method is internal and only exposed via other public methods that
     * select a specific behavior.
     * 
     * @param command The command to execute in the VSCode terminal.
     * @param waitUntilFinished Whether to wait until the actual command has
     * finished executing, e.g. when the whole animation has been previewed.
     * If set to false (default), we only wait until the command has been issued,
     * i.e. sent to the terminal.
     * @param forceExecute Whether to force the execution of the command even if
     * another command is currently running. This is only taken into account
     * when the `shouldLockDuringCommandExecution` is set to true.
     * @param errorOnNoActiveShell Whether to execute the command only if an
     * active shell exists. If no active shell is found, an error is thrown.
     * @param startLine The line number in the active editor where the Manim
     * session should start in case a new terminal is spawned.
     * Also see `startScene(). You MUST set a startLine if `errorOnNoActiveShell`
     * is set to false, since the method might invoke a new shell in this case
     * and needs to know at which line to start it.
     * @param handler Event handler for command execution events. See the
     * interface `CommandExecutionEventHandler`.
     * 
     * @throws NoActiveShellError If no active shell is found, but an active
     * shell is required for the command execution (when `errorOnNoActiveShell`
     * is set to true).
     */
    private async execCommand(
        command: string,
        waitUntilFinished: boolean,
        forceExecute: boolean,
        errorOnNoActiveShell: boolean,
        startLine?: number,
        handler?: CommandExecutionEventHandler
    ) {
        if (!errorOnNoActiveShell && startLine === undefined) {
            // should never happen if method is called correctly
            window.showErrorMessage("Start line not set. Internal extension error.");
            return;
        }

        if (this.lockDuringStartup) {
            window.showWarningMessage("Manim is currently starting. Please wait a moment.");
            return;
        }

        if (errorOnNoActiveShell && !this.hasActiveShell()) {
            throw new NoActiveShellError();
        }

        if (this.shouldLockDuringCommandExecution && !forceExecute && this.isExecutingCommand) {
            window.showWarningMessage(
                `Simultaneous Manim commands are not currently supported on MacOS. `
                + `Please wait for the current operations to finish before initiating `
                + `a new command.`);
            return;
        }

        this.isExecutingCommand = true;

        let shell: Terminal;
        if (errorOnNoActiveShell) {
            shell = this.activeShell as Terminal;
        } else {
            this.lockDuringStartup = true;
            shell = await this.retrieveOrInitActiveShell(startLine!);
            this.lockDuringStartup = false;
        }

        this.exec(shell, command);
        handler?.onCommandIssued?.();

        if (waitUntilFinished) {
            await new Promise(resolve => {
                this.eventEmitter.once(ManimShellEvent.IPYTHON_CELL_FINISHED, resolve);
            });
        }

        this.eventEmitter.once(ManimShellEvent.IPYTHON_CELL_FINISHED, () => {
            this.isExecutingCommand = false;
        });
    }

    /**
     * This command should only be used from within the actual `startScene()`
     * method. It starts a new ManimGL scene in the terminal and waits until
     * Manim is initialized. If an active shell is already running, it will be
     * exited before starting the new scene.
     * 
     * This method is needed to avoid recursion issues since the usual
     * command execution will already start a new scene if no active shell is
     * found.
     * 
     * @param command The command to execute in the VSCode terminal. This is
     * usually the command to start the ManimGL scene (at a specific line).
     * @param isRequestedForAnotherCommand Whether the command is executed
     * because another command needed to have a new shell started.
     * Only if the user manually starts a new scene, we want to exit a
     * potentially already running scene beforehand.
     */
    public async executeStartCommand(command: string, isRequestedForAnotherCommand: boolean) {
        if (!isRequestedForAnotherCommand) {
            if (this.hasActiveShell()) {
                const KILL_IT_OPTION = "Kill it";
                const selection = await window.showWarningMessage(
                    "We need to kill your Manim session to spawn a new one",
                    KILL_IT_OPTION, "Cancel");
                if (selection === undefined || selection !== KILL_IT_OPTION) {
                    return;
                }
                exitScene();
            }
            this.activeShell = window.createTerminal();
        }
        // We are sure that the active shell is set since it is invoked
        // in `retrieveOrInitActiveShell()` or in the line above.
        this.exec(this.activeShell as Terminal, command);
        await new Promise(resolve => {
            this.eventEmitter.once(ManimShellEvent.IPYTHON_CELL_FINISHED, resolve);
        });
    }

    /**
    * Resets the active shell such that a new terminal is created on the next
    * command execution.
    */
    public resetActiveShell() {
        this.activeShell = null;
    }

    /**
     * Returns whether an active shell exists, i.e. a terminal that has an
     * active ManimGL IPython session running.
     * 
     * A shell that was previously used to run Manim, but has exited from the
     * Manim session (IPython environment), is considered inactive.
     */
    private hasActiveShell(): boolean {
        return this.activeShell !== null && this.activeShell.exitStatus === undefined;
    }

    /**
     * Executes the command in the shell using shell integration if available,
     * otherwise using `sendText`.
     * 
     * This method is NOT asynchronous by design, as Manim commands run in the
     * IPython terminal that the VSCode API does not natively support. I.e.
     * the event does not actually end when the command has finished running,
     * since we are still in the IPython environment.
     * 
     * Note that this does not hold true for the initial setup of the terminal
     * and the first `checkpoint_paste()` call, which is why we disable the
     * detection of the "shell execution end" while the commands are issued.
     * 
     * @param shell The shell to execute the command in.
     * @param command The command to execute in the shell.
     */
    private exec(shell: Terminal, command: string) {
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
     * @param startLine The line number in the active editor where the Manim
     * session should start in case a new terminal is spawned.
     * Also see: `startScene()`.
     */
    private async retrieveOrInitActiveShell(startLine: number): Promise<Terminal> {
        if (!this.hasActiveShell()) {
            this.activeShell = window.createTerminal();
            await startScene(startLine);
        }
        return this.activeShell as Terminal;
    }

    /**
     * Inits the reading of data from the terminal and issues actions/events
     * based on the data received:
     * 
     * - If the Manim welcome string is detected, the terminal is marked as
     *   active.
     * - If an IPython cell has finished executing, an event is emitted such
     *   that commands know when they are actually completely finished, e.g.
     *   when the whole animation has been previewed.
     * - If an error is detected, the terminal is opened to show the error.
     * - If the whole Manim session has ended, the active shell is reset.
     */
    private initiateTerminalDataReading() {
        window.onDidStartTerminalShellExecution(
            async (event: vscode.TerminalShellExecutionStartEvent) => {
                const stream = event.execution.read();
                for await (const data of withoutAnsiCodes(stream)) {

                    if (data.match(MANIM_WELCOME_REGEX)) {
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

/**
 * Removes ANSI control codes from the given stream of strings and yields the
 * cleaned strings.
 * 
 * @param stream The stream of strings to clean.
 * @returns An async iterable stream of strings without ANSI control codes.
 */
async function* withoutAnsiCodes(stream: AsyncIterable<string>) {
    for await (const data of stream) {
        yield data.replace(ANSI_CONTROL_SEQUENCE_REGEX, '');
    }
}
