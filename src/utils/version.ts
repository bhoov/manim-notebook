import * as vscode from 'vscode';
import { window } from 'vscode';
import { waitNewTerminalDelay, withoutAnsiCodes, onTerminalOutput } from './terminal';
import { EventEmitter } from 'events';
import { Window } from '../logger';

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

/**
 * Tries to determine the Manim version for the first time.
 */
export async function tryToDetermineManimVersionForTheFirstTime() {
    let res;
    let isCanceledByUser = false;
    const terminal = await window.createTerminal(
        {
            name: "ManimGL Version",
            iconPath: new vscode.ThemeIcon("tag")
        });
    await waitNewTerminalDelay();

    try {
        await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Determining ManimGL version...",
            cancellable: true,
        }, async (progress, token) => {
            res = await new Promise<boolean>(async (resolve, reject) => {
                progress.report({ increment: 0 });
                const maxWait = 8000;

                const timeoutPromise = new Promise(async (_, reject) => {
                    const timeout = setTimeout(reject, maxWait);
                    token.onCancellationRequested(() => {
                        isCanceledByUser = true;
                        clearTimeout(timeout);
                        reject();
                    });

                    const numChunks = Math.ceil(maxWait / 500);
                    for (let i = 0; i < numChunks; i++) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        progress.report({ increment: 100 / numChunks });
                    }
                });

                const versionPromise = tryToDetermineManimVersion(terminal);

                Promise.race([timeoutPromise, versionPromise])
                    .then(() => resolve(true))
                    .catch((_error) => {
                        reject();
                    });
            });
        });
    } catch (error) {
        if (!isCanceledByUser) {
            Window.showErrorMessage("🔍 ManimGL version could not be determined.");
        }
    } finally {
        if (res) {
            window.showInformationMessage(`🔍 ManimGL version: ${MANIM_VERSION}`);
            terminal.dispose();
        }
    }
}

/**
 * Tries to determine the Manim version by means of the `manimgl --version`
 * command.
 * 
 * @returns True if the version was determined, false otherwise.
 */
export async function tryToDetermineManimVersion(terminal: vscode.Terminal): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
        onTerminalOutput(terminal, (data: string) => {
            const versionMatch = data.match(/^\s*ManimGL v([0-9]+\.[0-9]+\.[0-9]+)/);
            if (!versionMatch) {
                return;
            }
            MANIM_VERSION = versionMatch[1];
            console.log(`🔍 ManimGL version: ${MANIM_VERSION}`);
            terminal.dispose();
            resolve(true);
        });
        terminal.sendText("manimgl --version");
    });
}
