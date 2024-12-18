import * as vscode from 'vscode';
import { window } from 'vscode';
import { waitNewTerminalDelay, withoutAnsiCodes } from './terminal';

let MANIM_VERSION: string | undefined;

/**
 * Checks if the given version is at least the required version.
 */
function isAtLeastVersion(versionRequired: string, version: string): boolean {
    const versionRequiredParts = versionRequired.split('.');
    const versionParts = version.split('.');

    for (let i = 0; i < versionRequiredParts.length; i++) {
        if (versionParts[i] === undefined) {
            return false;
        }

        const versionPart = parseInt(versionParts[i], 10);
        const versionRequiredPart = parseInt(versionRequiredParts[i], 10);

        if (versionPart > versionRequiredPart) {
            return true;
        }
        if (versionPart < versionRequiredPart) {
            return false;
        }
    }

    return true;
}

/**
 * Returns true if the current Manim version is at least the required version.
 */
export function isAtLeastManimVersion(versionRequired: string): boolean {
    if (!MANIM_VERSION) {
        return false;
    }
    return isAtLeastVersion(versionRequired, MANIM_VERSION);
}

export async function tryToDetermineManimVersion() {
    const terminal = await window.createTerminal("ManimGL Version Check");
    await waitNewTerminalDelay();
    window.onDidStartTerminalShellExecution(
        async (event: vscode.TerminalShellExecutionStartEvent) => {
            if (event.terminal !== terminal) {
                return;
            }

            const stream = event.execution.read();
            for await (const data of withoutAnsiCodes(stream)) {
                const versionMatch = data.match(/^\s*ManimGL v([0-9]+\.[0-9]+\.[0-9]+)/);
                if (versionMatch) {
                    MANIM_VERSION = versionMatch[1];
                    console.log(`🔍 ManimGL version: ${MANIM_VERSION}`);
                    terminal.dispose();
                }
            }
        });
    terminal.sendText("manimgl --version");
}
