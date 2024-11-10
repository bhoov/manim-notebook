import * as vscode from 'vscode';
import { QuickPickItem } from 'vscode';
import { MultiStepInput, toQuickPickItem, toQuickPickItems, shouldResumeNoOp } from './multiStepVscode';

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
    }

    const state = {} as Partial<State>;
    await MultiStepInput.run((input: MultiStepInput) => pickQuality(input, state));

    vscode.window.showInformationMessage(`Exporting scene, ${state}`);
}
