import * as vscode from 'vscode';
import { window } from 'vscode';
import { Terminal } from 'vscode';
import { startScene, exitScene } from './startStopScene';
import { EventEmitter } from 'events';
import { Logger, Window } from './logger';

/**
 * Regular expression to match ANSI control sequences. Even though we might miss
 * some control sequences, this is good enough for our purposes as the relevant
 * ones are matched. From: https://stackoverflow.com/a/14693789/
 */
const ANSI_CONTROL_SEQUENCE_REGEX = /(?:\x1B[@-Z\\-_]|[\x80-\x9A\x9C-\x9F]|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~])/g;

/**
 * Regular expression to match the start of an IPython cell, e.g. "In [5]:"
 */
const IPYTHON_CELL_START_REGEX = /^\s*In \[\d+\]:/gm;

/**
 * Regular expression to match an info message in the terminal,
 * e.g. `[17:07:34] INFO`. This is used to detect when the end is reached
 * when Manim was started not in the interactive embedded mode, but in a way
 * to preview the whole scene (without the `-se <lineNumber>` argument).
 */
const LOG_INFO_MESSAGE_REGEX = /^\s*\[.*\] INFO/m;

/**
 * Regular expression to match IPython multiline input "...:"
 * Sometimes IPython does not execute code when entering a newline, but enters a
 * multiline input mode, where it expects another line of code. We detect that
 * this happens and send an extra newline to run the code
 * See: https://github.com/Manim-Notebook/manim-notebook/issues/18
 */
const IPYTHON_MULTILINE_START_REGEX = /^\s*\.{3}:\s+$/m;

/**
 * Regular expression to match a KeyboardInterrupt.
 */
const KEYBOARD_INTERRUPT_REGEX = /^\s*KeyboardInterrupt/m;

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

    /**
     * Event emitted when a log info message is detected in the terminal.
     */
    LOG_INFO_MESSAGE = 'logInfoMessage',

    /**
     * Event emitted when a keyboard interrupt is detected in the terminal, e.g.
     * when `Ctrl+C` is pressed to stop the current command execution.
     */
    KEYBOARD_INTERRUPT = 'keyboardInterrupt',

    /**
     * Event emitted when data is received from the terminal, but stripped of
     * ANSI control codes.
     */
    DATA = 'ansiStrippedData',

    /**
     * Event emitted when ManimGL could not be started, i.e. the terminal
     * execution has ended before we have detected the start of the ManimGL
     * session.
     */
    MANIM_NOT_STARTED = 'manimglNotStarted',

    /**
     * Event emitted when the active shell is reset.
     */
    RESET = 'reset'
}

/**
 * Event handler for command execution events.
 */
export interface CommandExecutionEventHandler {
    /**
     * Callback that is invoked when the command is issued, i.e. sent to the
     * terminal. At this point, the command is probably not yet finished
     * executing.
     * 
     * @param shellStillExists Whether the shell still exists after the command
     * was issued. In certain scenarios (e.g. user manually exits the shell
     * during Manim startup), the shell might not exist anymore after the
     * command was issued.
     */
    onCommandIssued?: (shellStillExists: boolean) => void;

    /**
     * Callback that is invoked when data is received from the active Manim
     * session (IPython shell).
     * 
     * @param data The data that was received from the terminal, but stripped
     * of ANSI control codes.
     */
    onData?: (data: string) => void;

    /**
     * Callback that is invoked when the manim shell is reset. This indicates
     * that the event handler should clean up any resources.
     */
    onReset?: () => void;
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
    private shellWeTryToSpawnIn: Terminal | null = null;
    private eventEmitter = new EventEmitter();

    /**
     * The current IPython cell count. Updated whenever a cell indicator is
     * detected in the terminal output. This is used to determine when a new cell
     * has started, i.e. when the command has finished executing.
     */
    private iPythonCellCount: number = 0;

    /**
     * Whether to wait for a restarted IPython instance, i.e. for an IPython
     * cell count of 1. This is set to `true` before the `reload()` command is
     * issued and set back to `false` after the IPython cell count is 1.
     */
    waitForRestartedIPythonInstance = false;

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
     * See issue #16: https://github.com/Manim-Notebook/manim-notebook/issues/16
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
     * Indicates that the next command should wait until a restarted IPython
     * instance is detected, i.e. starting with cell 1 again. This should be
     * called before the `reload()` command is issued.
     */
    public async nextTimeWaitForRestartedIPythonInstance() {
        if (await this.isLocked()) {
            return;
        }

        this.iPythonCellCount = 0;
        this.waitForRestartedIPythonInstance = true;
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
     * Returns whether the command execution is currently locked, i.e. when
     * Manim is starting up or another command is currently running.
     * 
     * @param forceExecute see `execCommand()`
     * @returns true if the command execution is locked, false otherwise.
     */
    private async isLocked(forceExecute = false): Promise<boolean> {
        if (this.lockDuringStartup) {
            Window.showWarningMessage("Manim is currently starting. Please wait a moment.");
            return true;
        }

        if (this.isExecutingCommand) {
            // MacOS specific behavior
            if (this.shouldLockDuringCommandExecution && !forceExecute) {
                Window.showWarningMessage(
                    `Simultaneous Manim commands are not currently supported on MacOS. `
                    + `Please wait for the current operations to finish before initiating `
                    + `a new command.`);
                return true;
            }

            this.sendKeyboardInterrupt();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return false;
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
        Logger.debug(`🚀 Exec command: ${command}, waitUntilFinished=${waitUntilFinished}`
            + `, forceExecute=${forceExecute}, errorOnNoActiveShell=${errorOnNoActiveShell}`);

        if (!errorOnNoActiveShell && startLine === undefined) {
            // should never happen if method is called correctly
            Window.showErrorMessage("Start line not set. Internal extension error.");
            return;
        }

        if (errorOnNoActiveShell) {
            this.errorOnNoActiveShell();
        }

        if (await this.isLocked(forceExecute)) {
            return;
        }

        this.isExecutingCommand = true;
        Logger.debug("🔒 Command execution locked");
        const resetListener = () => { handler?.onReset?.(); };
        this.eventEmitter.on(ManimShellEvent.RESET, resetListener);

        let shell: Terminal;
        if (errorOnNoActiveShell) {
            shell = this.activeShell as Terminal;
        } else {
            this.lockDuringStartup = true;
            shell = await this.retrieveOrInitActiveShell(startLine!);
            this.lockDuringStartup = false;
        }

        const dataListener = (data: string) => { handler?.onData?.(data); };
        this.eventEmitter.on(ManimShellEvent.DATA, dataListener);

        let currentExecutionCount = this.iPythonCellCount;

        this.exec(shell, command);
        handler?.onCommandIssued?.(this.activeShell !== null);

        this.waitUntilCommandFinished(currentExecutionCount, () => {
            Logger.debug("🔓 Command execution unlocked");
            this.isExecutingCommand = false;
            this.eventEmitter.off(ManimShellEvent.DATA, dataListener);
            this.eventEmitter.off(ManimShellEvent.RESET, resetListener);
        });
        if (waitUntilFinished) {
            Logger.debug(`🕒 Waiting until command has finished: ${command}`);
            await this.waitUntilCommandFinished(currentExecutionCount);
            Logger.debug(`🕒 Command has finished: ${command}`);
        }
    }

    /**
     * Errors if no active shell is found.
     */
    public errorOnNoActiveShell() {
        if (!this.hasActiveShell()) {
            throw new NoActiveShellError();
        }
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
     * @param shouldPreviewWholeScene Whether the command requests to preview
     * the whole scene, i.e. without the `-se <lineNumber>` argument. In this
     * case, we wait until an info message is shown in the terminal to detect
     * when the whole scene has been previewed. Otherwise, we wait until the
     * first IPython cell is found.
     */
    public async executeStartCommand(command: string,
        isRequestedForAnotherCommand: boolean, shouldPreviewWholeScene: boolean) {
        if (!isRequestedForAnotherCommand) {
            Logger.debug("🔆 Executing start command that is requested for its own");
            if (this.hasActiveShell()) {
                const shouldAsk = await vscode.workspace.getConfiguration("manim-notebook")
                    .get("confirmKillingActiveSceneToStartNewOne");
                if (shouldAsk) {
                    Logger.debug("🔆 Active shell found, asking user to kill active scene");
                    if (!await this.doesUserWantToKillActiveScene()) {
                        Logger.debug("🔆 User didn't want to kill active scene");
                        return;
                    }
                }
                Logger.debug("🔆 User confirmed to kill active scene");
                await this.forceQuitActiveShell();
            }
            await this.openNewTerminal();
        } else {
            Logger.debug("🔆 Executing start command that is requested for another command");
        }

        if (shouldPreviewWholeScene) {
            Logger.debug("🥽 Whole scene preview requested");
        }

        await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: shouldPreviewWholeScene
                ? "Previewing whole scene..." : "Starting Manim...",
            cancellable: false
        }, async (progress, token) => {
            // We are sure that the active shell is set since it is invoked
            // in `retrieveOrInitActiveShell()` or in the line above.
            this.shellWeTryToSpawnIn = this.activeShell;
            this.exec(this.activeShell as Terminal, command);

            const commandFinishedPromise = shouldPreviewWholeScene
                ? this.waitUntilInfoMessageShown()
                : this.waitUntilCommandFinished(this.iPythonCellCount);
            const manimNotStartedPromise = new Promise<void>(resolve => {
                this.eventEmitter.once(ManimShellEvent.MANIM_NOT_STARTED, resolve);
            });
            await Promise.race([commandFinishedPromise, manimNotStartedPromise]);

            this.shellWeTryToSpawnIn = null;
        });

        Logger.debug("🔆 Execute Start command finished");
    }

    /**
    * Resets the active shell such that a new terminal is created on the next
    * command execution.
    * 
    * This will also remove all event listeners! Having called this method,
    * you should NOT emit any events anymore before a new Manim shell is
    * detected, as those events would not be caught by any listeners.
    */
    public resetActiveShell() {
        Logger.debug("💫 Reset active shell");
        this.isExecutingCommand = false;
        this.iPythonCellCount = 0;
        this.activeShell = null;
        this.shellWeTryToSpawnIn = null;
        this.eventEmitter.emit(ManimShellEvent.RESET);
        this.eventEmitter.removeAllListeners();
    }

    /**
     * Forces the terminal to quit and thus the ManimGL session to end.
     * 
     * Beforehand, this was implemented more gracefully by sending a keyboard
     * interrupt (`Ctrl+C`), followed by the `exit()` command in the IPython
     * session. However, on MacOS, the keyboard interrupt itself already exits
     * from the entire IPython session and does not just interrupt the current
     * running command (inside IPython) as would be expected.
     * See https://github.com/3b1b/manim/discussions/2236
     * 
     * @param sendManimNotStartedEvent Whether to emit the `MANIM_NOT_STARTED`
     * event. E.g. this is set to false when we detect a Manim welcome string
     * in a new terminal and close the old one.
     */
    public async forceQuitActiveShell(sendManimNotStartedEvent = true) {
        if (this.activeShell) {
            Logger.debug("🔚 Force-quitting active shell");
            if (sendManimNotStartedEvent) {
                this.eventEmitter.emit(ManimShellEvent.MANIM_NOT_STARTED);
            }
            let lastActiveShell = this.activeShell;
            await this.sendKeyboardInterrupt();
            lastActiveShell?.dispose();
            // This is also taken care of when we detect that the shell has ended
            // in the `onDidEndTerminalShellExecution` event handler. However,
            // it doesn't harm to reset the active shell here as well just to
            // be sure.
            this.resetActiveShell();
        } else {
            Logger.debug("🔚 No active shell found to force quit");
        }
    }

    /**
     * Ask the user if they want to kill the active scene. Might modify the
     * setting that controls if the user should be asked in the future.
     * 
     * @returns true if the user wants to kill the active scene, false otherwise.
     */
    private async doesUserWantToKillActiveScene(): Promise<boolean> {
        const CANCEL_OPTION = "Cancel";
        const KILL_IT_ALWAYS_OPTION = "Kill it (don't ask the next time)";

        const selection = await Window.showWarningMessage(
            "We need to kill your Manim session to spawn a new one.",
            "Kill it", KILL_IT_ALWAYS_OPTION, CANCEL_OPTION);
        if (selection === undefined) {
            Logger.warn("❌ User selection undefined, but shouldn't be");
        }
        if (selection === undefined || selection === CANCEL_OPTION) {
            return false;
        }

        if (selection === KILL_IT_ALWAYS_OPTION) {
            await vscode.workspace.getConfiguration("manim-notebook")
                .update("confirmKillingActiveSceneToStartNewOne", false);
            Window.showInformationMessage(
                "You can re-enable the confirmation in the settings.");
        }
        return true;
    }

    /**
     * Returns whether an active shell exists, i.e. a terminal that has an
     * active ManimGL IPython session running.
     * 
     * A shell that was previously used to run Manim, but has exited from the
     * Manim session (IPython environment), is considered inactive.
     */
    public hasActiveShell(): boolean {
        const hasActiveShell =
            this.activeShell !== null && this.activeShell.exitStatus === undefined;
        Logger.debug(`👩‍💻 Has active shell?: ${hasActiveShell}`);
        return hasActiveShell;
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
     * @param useShellIntegration Whether to use shell integration if available
     */
    private exec(shell: Terminal, command: string, useShellIntegration = true) {
        this.detectShellExecutionEnd = false;
        Logger.debug("🔒 Shell execution end detection disabled");

        if (useShellIntegration && shell.shellIntegration) {
            Logger.debug(`💨 Sending command to terminal (with shell integration): ${command}`);
            shell.shellIntegration.executeCommand(command);
        } else {
            Logger.debug(`💨 Sending command to terminal (without shell integration): ${command}`);
            shell.sendText(command);
        }

        this.detectShellExecutionEnd = true;
        Logger.debug("🔓 Shell execution end detection re-enabled");
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
            Logger.debug("🔍 No active shell found, requesting startScene");
            await this.openNewTerminal();
            await startScene(startLine);
            Logger.debug("🔍 Started new scene to retrieve new shell");
        } else {
            Logger.debug("🔍 Active shell already there");
        }
        return this.activeShell as Terminal;
    }

    /**
     * Opens a new terminal and sets it as the active shell. Afterwards, waits
     * for a user-defined delay before allowing the terminal to be used, which
     * might be useful for some activation scripts to load like virtualenvs etc.
     */
    private async openNewTerminal() {
        // We don't want to detect shell execution ends here, since commands like
        // `source venv/bin/activate` might on their own trigger a terminal
        // execution end.
        this.detectShellExecutionEnd = false;

        this.activeShell = window.createTerminal();
        await waitNewTerminalDelay();

        this.detectShellExecutionEnd = true;
    }

    /**
     * Waits until the current command has finished executing by waiting for
     * the start of the next IPython cell. This is used to ensure that the
     * command has actually finished executing, e.g. when the whole animation
     * has been previewed.
     * 
     * Can be interrupted by a keyboard interrupt.
     * 
     * @param currentExecutionCount The current IPython cell count when the
     * command was issued. This is used to detect when the next cell has started.
     * @param callback An optional callback that is invoked when the command
     * has finished executing. This is useful when the caller does not want to
     * await the async function, but still wants to execute some code after the
     * command has finished.
     */
    private async waitUntilCommandFinished(
        currentExecutionCount: number, callback?: () => void) {
        await new Promise<void>(resolve => {
            this.eventEmitter.once(ManimShellEvent.KEYBOARD_INTERRUPT, resolve);

            const listener = () => {
                Logger.debug("🕒 While waiting for command to finish"
                    + `, iPythonCellCount=${this.iPythonCellCount}`
                    + `, currentExecutionCount=${currentExecutionCount}`);
                if (this.iPythonCellCount > currentExecutionCount) {
                    Logger.debug("🕒 Command has finished");
                    this.eventEmitter.off(ManimShellEvent.IPYTHON_CELL_FINISHED, listener);
                    resolve();
                }
            };
            this.eventEmitter.on(ManimShellEvent.IPYTHON_CELL_FINISHED, listener);
        });
        if (callback) {
            Logger.debug("🕒 Calling callback after command has finished");
            callback();
        }
    }

    /**
     * Waits until an info message is shown in the terminal.
     * 
     * Can be interrupted by a keyboard interrupt.
     */
    private async waitUntilInfoMessageShown() {
        await Promise.race([
            new Promise<void>(resolve => this.eventEmitter.once(ManimShellEvent.KEYBOARD_INTERRUPT, resolve)),
            new Promise<void>(resolve => this.eventEmitter.once(ManimShellEvent.LOG_INFO_MESSAGE, resolve))
        ]);
    }

    private async sendKeyboardInterrupt() {
        Logger.debug("💨 Sending keyboard interrupt to terminal");
        await this.activeShell?.sendText('\x03'); // send `Ctrl+C`
        await new Promise(resolve => setTimeout(resolve, 250));
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
                    Logger.trace(`🧾 Terminal data:\n${data}`);

                    if (data.match(MANIM_WELCOME_REGEX)) {
                        // Manim detected in new terminal
                        if (this.activeShell && this.activeShell !== event.terminal) {
                            Logger.debug("👋 Manim detected in new terminal, exiting old scene");
                            await this.forceQuitActiveShell(false);
                        }
                        Logger.debug("👋 Manim welcome string detected");
                        this.activeShell = event.terminal;
                    }

                    // Subsequent data handling should only occur for the
                    // currently active shell. This is important during
                    // overlapping commands, e.g. when one shell is exited
                    // and another one started.
                    if (this.activeShell !== event.terminal) {
                        continue;
                    }

                    this.eventEmitter.emit(ManimShellEvent.DATA, data);

                    if (data.match(KEYBOARD_INTERRUPT_REGEX)) {
                        Logger.debug("🛑 Keyboard interrupt detected");
                        this.eventEmitter.emit(ManimShellEvent.KEYBOARD_INTERRUPT);
                    }

                    if (data.match(LOG_INFO_MESSAGE_REGEX)) {
                        Logger.debug("📜 Log info message detected");
                        this.eventEmitter.emit(ManimShellEvent.LOG_INFO_MESSAGE);
                    }

                    let ipythonMatches = data.match(IPYTHON_CELL_START_REGEX);
                    if (ipythonMatches) {
                        // Terminal data might include multiple IPython statements
                        const cellNumbers = ipythonMatches.map(
                            match => parseInt(match.match(/\d+/)![0]));

                        if (this.waitForRestartedIPythonInstance) {
                            const cellNumber = Math.min(...cellNumbers);
                            Logger.debug("📦 While waiting for restarted IPython instance:"
                                + ` cell ${cellNumber} detected`);
                            if (cellNumber === 1) {
                                Logger.debug("🔄 Restarted IPython instance detected");
                                this.iPythonCellCount = 1;
                                this.waitForRestartedIPythonInstance = false;
                                this.eventEmitter.emit(ManimShellEvent.IPYTHON_CELL_FINISHED);
                            }
                        } else {
                            // more frequent case
                            const cellNumber = Math.max(...cellNumbers);
                            this.iPythonCellCount = cellNumber;
                            Logger.debug(`📦 IPython cell ${cellNumber} detected`);
                            this.eventEmitter.emit(ManimShellEvent.IPYTHON_CELL_FINISHED);
                        }
                    }

                    if (this.isExecutingCommand && data.match(IPYTHON_MULTILINE_START_REGEX)) {
                        Logger.debug(`💨 IPython multiline detected, sending extra newline`);
                        // do not use shell integration here, as it might send a CTRL-C
                        // while the prompt is not finished yet
                        // \x7F deletes the extra line ("...:") from IPython
                        this.exec(this.activeShell, "\x7F", false);
                    }

                    if (data.match(ERROR_REGEX)) {
                        Logger.debug("🚨 Error in IPython cell detected");
                        this.activeShell?.show();
                    }
                }
            });

        window.onDidEndTerminalShellExecution(
            async (event: vscode.TerminalShellExecutionEndEvent) => {
                if (this.shellWeTryToSpawnIn === event.terminal) {
                    Logger.debug("❌ Tried to spawn a new Manim session, but it failed");
                    this.eventEmitter.emit(ManimShellEvent.MANIM_NOT_STARTED);
                    this.resetActiveShell();
                    Window.showErrorMessage(
                        "Manim session could not be started."
                        + " There was a problem running the `manimgl` command.");
                    event.terminal.show();
                    return;
                }

                if (!this.detectShellExecutionEnd) {
                    Logger.debug("🔒 Shell execution end detection disabled while end event fired");
                    return;
                }

                if (event.terminal === this.activeShell) {
                    Logger.debug("🔚 Active shell execution ended, will reset");
                    this.resetActiveShell();
                }
            });

        /**
         * This event is fired when a terminal is closed manually by the user.
         * In this case, we can only do our best to clean up since the terminal
         * is probably not able to receive commands anymore. It's mostly for us
         * to reset all states such that we're ready for the next command.
         * 
         * When closing while previewing a scene, the terminal is closed, however
         * we are not able to send a keyboard interrupt anymore. Therefore,
         * ManimGL will take a few seconds to actually close its window. When
         * the user employs our "Quit preview" command instead, the preview will
         * be closed immediately.
         */
        window.onDidCloseTerminal(async (terminal: Terminal) => {
            if (terminal !== this.activeShell) {
                return;
            }
            Logger.debug("🔚 Active shell closed");
            this.eventEmitter.emit(ManimShellEvent.MANIM_NOT_STARTED);
            this.eventEmitter.emit(ManimShellEvent.KEYBOARD_INTERRUPT);
            this.forceQuitActiveShell(); // don't await here on purpose
            this.resetActiveShell();
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
