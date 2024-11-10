import * as vscode from 'vscode';
import { QuickPickItem, window } from 'vscode';
import { MultiStepInput, toQuickPickItem, toQuickPickItems, shouldResumeNoOp } from './multiStepVscode';
import { findClassLines } from './pythonParsing';
import { Logger, Window } from './logger';
import { waitNewTerminalDelay } from './manimShell';


class VideoQuality {
    static readonly LOW = new VideoQuality('Low Quality (480p)', '--low_quality');
    static readonly MEDIUM = new VideoQuality('Medium Quality (720p)', '--medium_quality');
    static readonly HIGH = new VideoQuality('High Quality (1080p)', '--hd');
    static readonly VERY_HIGH = new VideoQuality('Very High Quality (4K)', '--uhd');

    private constructor(public readonly name: string, public readonly cliFlag: string) { }

    static names(): string[] {
        return Object.values(VideoQuality).map((quality) => quality.name);
    }

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

export async function exportScene(sceneName?: string) {
    if (sceneName === undefined) {
        return Window.showErrorMessage("No scene name scecified for export");
    }

    const QUICK_PICK_TITLE = "Export scene as video";


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
                    return "Please enter a positive number";
                }
                return undefined;
            },
            shouldResume: shouldResumeNoOp,
        });
        state.fps = fps;

        return (input: MultiStepInput) => pickFileName(input, state);
    }

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
                    return "Please enter a filename";
                }
                return undefined;
            },
            shouldResume: shouldResumeNoOp,
        });
        state.fileName = fileName;

        return (input: MultiStepInput) => pickFileLocation(input, state);
    }

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

    const state = {} as Partial<VideoSettings>;
    state.sceneName = sceneName;
    await MultiStepInput.run((input: MultiStepInput) => pickQuality(input, state));

    if (!state.quality || !state.fps || !state.fileName || !state.folderPath) {
        Logger.debug("⭕ Export scene cancelled");
        return;
    }

    const settingsCmd = toManimExportCommand(state as VideoSettings);
    if (!settingsCmd) {
        return;
    }

    const terminal = window.createTerminal("Manim Export");
    terminal.show();
    await waitNewTerminalDelay();
    terminal.sendText(settingsCmd, false);
}

function toManimExportCommand(settings: VideoSettings): string | null {
    const editor = window.activeTextEditor;
    if (!editor) {
        Window.showErrorMessage(
            'No opened file found. Please place your cursor at a line of code.'
        );
        return null;
    }

    const filePath = editor.document.fileName;
    const cmds = [
        "manimgl", `"${filePath}"`, settings.sceneName,
        "-w", settings.quality, `--fps ${settings.fps}`,
        `--video_dir "${settings.folderPath}"`,
        `--file_name "${settings.fileName}"`
    ];
    return cmds.join(" ");
}

export class ExportSceneCodeLens implements vscode.CodeLensProvider {

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        for (const classLine of findClassLines(document)) {
            const range = new vscode.Range(classLine.lineNumber, 0, classLine.lineNumber, 0);

            codeLenses.push(new vscode.CodeLens(range, {
                title: "📼 Export Scene",
                command: "manim-notebook.exportScene",
                tooltip: "Export this scene as a video",
                arguments: [classLine.className]
            }));
        }

        return codeLenses;
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
        return codeLens;
    }
}
