import * as vscode from 'vscode';
import { QuickPickItem, window } from 'vscode';
import {
    MultiStepInput, toQuickPickItem, toQuickPickItems,
    shouldResumeNoOp
} from './utils/multiStepQuickPickUtil';
import { findClassLines, findManimSceneName } from './pythonParsing';
import { Logger, Window } from './logger';
import { waitNewTerminalDelay } from './manimShell';


class VideoQuality {
    static readonly LOW = new VideoQuality('Low Quality (480p)', '--low_quality');
    static readonly MEDIUM = new VideoQuality('Medium Quality (720p)', '--medium_quality');
    static readonly HIGH = new VideoQuality('High Quality (1080p)', '--hd');
    static readonly VERY_HIGH = new VideoQuality('Very High Quality (4K)', '--uhd');

    private constructor(public readonly name: string, public readonly cliFlag: string) { }

    /**
     * Returns the names of all VideoQuality objects.
     */
    static names(): string[] {
        return Object.values(VideoQuality).map((quality) => quality.name);
    }

    /**
     * Returns the VideoQuality object that has the given name.
     */
    static fromName(name: string): VideoQuality {
        return Object.values(VideoQuality).find((quality) => quality.name === name);
    }
}

interface VideoSettings {
    sceneName: string;
    quality: string;
    fps: string;
    fileName: string;
    folderPath: string;
}

/**
 * Guides the user through a multi-step wizard to configure the export options
 * for a scene, i.e. quality, fps, filename, and folder path. The final command
 * is then pasted to a new terminal where the user can run it.
 * 
 * @param sceneName The name of the Manim scene to export. Optional if called
 * from the command palette. Not optional if called from a CodeLens.
 */
export async function exportScene(sceneName?: string) {
    await vscode.commands.executeCommand('workbench.action.files.save');

    // Command called via command palette
    if (sceneName === undefined) {
        const editor = window.activeTextEditor;
        if (!editor) {
            return Window.showErrorMessage(
                "No opened file found. Please place your cursor in a Manim scene.");
        }

        const sceneClassLine = findManimSceneName(editor.document, editor.selection.start.line);
        if (!sceneClassLine) {
            return Window.showErrorMessage("Place your cursor in a Manim scene.");
        }

        sceneName = sceneClassLine.className;
    }

    const QUICK_PICK_TITLE = "Export scene as video";

    /**
     * Lets the user pick the quality of the video to export.
     */
    async function pickQuality(input: MultiStepInput, state: Partial<VideoSettings>) {
        const qualityPick = await input.showQuickPick({
            title: QUICK_PICK_TITLE,
            step: 1,
            totalSteps: 3,
            placeholder: "Select the quality of the video to export",
            items: toQuickPickItems(VideoQuality.names()),
            shouldResume: shouldResumeNoOp
        });
        state.quality = VideoQuality.fromName(qualityPick.label).cliFlag;

        return (input: MultiStepInput) => pickFps(input, state);
    }

    /**
     * Lets the user pick the frames per second (fps) of the video to export.
     */
    async function pickFps(input: MultiStepInput, state: Partial<VideoSettings>) {
        const fps = await input.showInputBox({
            title: QUICK_PICK_TITLE,
            step: 2,
            totalSteps: 3,
            placeholder: "fps",
            prompt: "Frames per second (fps) of the video",
            value: typeof state.fps === 'string' ? state.fps : "30",
            validate: async (input: string) => {
                const fps = Number(input);
                if (isNaN(fps) || fps <= 0) {
                    return "Please enter a positive number.";
                }
                if (input.includes(".")) {
                    return "Please enter an integer number.";
                }
                return undefined;
            },
            shouldResume: shouldResumeNoOp,
        });
        state.fps = fps;

        return (input: MultiStepInput) => pickFileName(input, state);
    }

    /**
     * Lets the user pick the filename of the video to export. The default value
     * is the name of the scene followed by ".mp4".
     * 
     * It is ok to not append `.mp4` here as Manim will also do it if it is not
     * present in the filename.
     */
    async function pickFileName(input: MultiStepInput, state: Partial<VideoSettings>) {
        const fileName = await input.showInputBox({
            title: QUICK_PICK_TITLE,
            step: 3,
            totalSteps: 3,
            placeholder: `${sceneName}.mp4`,
            prompt: "Filename of the video",
            value: state.fileName ? state.fileName : `${sceneName}.mp4`,
            validate: async (input: string) => {
                if (!input) {
                    return "Please enter a filename.";
                }
                if (/[/\\]/g.test(input)) {
                    return "Please don't use slashes."
                        + " You can specify the folder in the next step.";
                }
                if (/[~`@!#$§%\^&*+=\[\]';,{}|":<>\?]/g.test(input)) {
                    return "Please don't use special characters in the filename.";
                }
                if (input.endsWith(".")) {
                    return "Please don't end the filename with a dot.";
                }
                return undefined;
            },
            shouldResume: shouldResumeNoOp,
        });
        state.fileName = fileName;

        return (input: MultiStepInput) => pickFileLocation(input, state);
    }

    /**
     * Lets the user pick the folder location where the video should be saved.
     */
    async function pickFileLocation(input: MultiStepInput, state: Partial<VideoSettings>) {
        const folderUri = await window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select folder",
            title: "Select folder to save the video to",
        });
        if (folderUri) {
            state.folderPath = folderUri[0].fsPath;
        }
    }

    /**
     * Initiates the multi-step wizard and returns the collected inputs
     * from the user.
     */
    async function collectInputs(): Promise<VideoSettings> {
        const state = {} as Partial<VideoSettings>;
        state.sceneName = sceneName;
        await MultiStepInput.run((input: MultiStepInput) => pickQuality(input, state));
        return state as VideoSettings;
    }

    const settings = await collectInputs();
    if (!settings.quality || !settings.fps || !settings.fileName || !settings.folderPath) {
        Logger.debug("⭕ Export scene cancelled since not all settings were provided");
        return;
    }

    const editor = window.activeTextEditor;
    if (!editor) {
        return Window.showErrorMessage(
            "No opened file found. Please place your cursor at a line of code.");
    }

    const settingsCmd = toManimExportCommand(settings, editor);
    const terminal = window.createTerminal("Manim Export");
    terminal.show();
    await waitNewTerminalDelay();
    terminal.sendText(settingsCmd, false);
}

/**
 * Converts the given VideoSettings object into a Manim export command.
 * 
 * See the Manim documentation for all supported flags:
 * https://3b1b.github.io/manim/getting_started/configuration.html#all-supported-flags
 * 
 * @param settings The settings defined via the multi-step wizard.
 * @param editor The active text editor.
 * @returns The Manim export command as a string.
 */
function toManimExportCommand(settings: VideoSettings, editor: vscode.TextEditor): string {
    const cmds = [
        "manimgl", `"${editor.document.fileName}"`, settings.sceneName,
        "-w", settings.quality, `--fps ${settings.fps}`,
        `--video_dir "${settings.folderPath}"`,
        `--file_name "${settings.fileName}"`
    ];
    return cmds.join(" ");
}

/**
 * A CodeLens provider that adds a `Export Scene` CodeLens to each Python
 * class definition line in the active document.
 */
export class ExportSceneCodeLens implements vscode.CodeLensProvider {

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken)
        : vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        for (const classLine of findClassLines(document)) {
            const range = new vscode.Range(classLine.lineNumber, 0, classLine.lineNumber, 0);

            codeLenses.push(new vscode.CodeLens(range, {
                title: "🎞️ Generate command to export scene",
                command: "manim-notebook.exportScene",
                tooltip: "Export this scene as a video",
                arguments: [classLine.className]
            }));
        }

        return codeLenses;
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken)
        : vscode.CodeLens {
        return codeLens;
    }
}
