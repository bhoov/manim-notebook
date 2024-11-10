import * as vscode from 'vscode';
import { window } from 'vscode';

class VideoQuality {
    static readonly LOW = new VideoQuality('Low Quality (480p)', '--low_quality');
    static readonly MEDIUM = new VideoQuality('Medium Quality (720p)', '--medium_quality');
    static readonly HIGH = new VideoQuality('High Quality (1080p)', '--hd');
    static readonly VERY_HIGH = new VideoQuality('Very high quality (4K)', '--uhd');

    private constructor(public readonly name: string, public readonly cliFlag: string) { }

    static names(): string[] {
        return Object.values(VideoQuality).map((quality) => quality.name);
    }

    static fromName(name: string): VideoQuality {
        return Object.values(VideoQuality).find((quality) => quality.name === name);
    }
}

export async function exportScene() {
    const quality = await window.showQuickPick(VideoQuality.names(), {
        placeHolder: "Select the quality of the video to export",
    });
    if (!quality) {
        return;
    }
    const videoQuality = VideoQuality.fromName(quality);

    const fps = await window.showInputBox({
        placeHolder: "fps",
        prompt: "Frames per second (fps) of the video",
        value: "30",
        validateInput: (input) => {
            const fps = Number(input);
            if (isNaN(fps) || fps <= 0) {
                return "Please enter a positive number";
            }
            return null;
        },
    });
    if (!fps) {
        return;
    }

    // window.showInformationMessage(`Exporting scene in ${videoQuality.cliFlag}...`);
    window.showInformationMessage(`Exporting scene in FPS: ${fps}`);
}
