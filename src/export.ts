import * as vscode from 'vscode';
import { QuickPickItem, window } from 'vscode';
import { MultiStepInput, toQuickPickItem, toQuickPickItems, shouldResumeNoOp } from './multiStepVscode';
import { findClassLines } from './pythonParsing';

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

export async function exportScene() {

    const QUICK_PICK_TITLE = "Export scene as video";

    interface State {
        quality: string;
        fps: string;
        filePath: string;
    }

    async function pickQuality(input: MultiStepInput, state: Partial<State>) {
        const qualityPick = await input.showQuickPick({
            title: QUICK_PICK_TITLE,
            step: 1,
            totalSteps: 2,
            placeholder: "Select the quality of the video to export",
            items: toQuickPickItems(VideoQuality.names()),
            shouldResume: shouldResumeNoOp
        });
        state.quality = VideoQuality.fromName(qualityPick.label).cliFlag;

        return (input: MultiStepInput) => pickFps(input, state);
    }

    async function pickFps(input: MultiStepInput, state: Partial<State>) {
        const fps = await input.showInputBox({
            title: QUICK_PICK_TITLE,
            step: 2,
            totalSteps: 2,
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

        return (input: MultiStepInput) => pickFileLocation(input, state);
    }

    async function pickFileLocation(input: MultiStepInput, state: Partial<State>) {
        const uri = await window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select folder",
            title: "Select folder to save the video to",
        });
        if (uri) {
            state.filePath = uri[0].fsPath;
        }
    }

    const state = {} as Partial<State>;
    await MultiStepInput.run((input: MultiStepInput) => pickQuality(input, state));

    if (state.quality && state.fps && state.filePath) {
        vscode.window.showInformationMessage(`Exporting scene: ${state.quality}, ${state.fps} fps, ${state.filePath}`);
    }
}

export class ExportSceneCodeLens implements vscode.CodeLensProvider {
    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        const classLines = findClassLines(document);
        const ranges = classLines.map(({ lineNumber }) => new vscode.Range(lineNumber, 0, lineNumber, 0));

        for (const range of ranges) {
            codeLenses.push(new vscode.CodeLens(range, {
                title: "Export Scene",
                command: "manim-notebook.exportScene",
                tooltip: "Export this scene as a video"
            }));
        }

        return codeLenses;
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
        return codeLens;
    }
}
