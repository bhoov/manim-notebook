import * as vscode from 'vscode';
import { window } from 'vscode';
import { waitNewTerminalDelay, withoutAnsiCodes, onTerminalOutput } from './terminal';
import { EventEmitter } from 'events';
import { Window, Logger } from '../logger';

/**
 * Manim version that the user has installed without the 'v' prefix, e.g. '1.2.3'.
 */
let MANIM_VERSION: string | undefined;
let isCanceledByUser = false;

/**
 * Checks if the given version is at least the required version.
 * 
 * @param versionRequired The required version, e.g. '1.2.3'.
 * @param version The version to compare against, e.g. '1.3.4'.
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
 * Returns the tag name of the latest Manim release if the GitHub API is reachable.
 * This tag name won't include the 'v' prefix, e.g. '1.2.3'.
 */
async function fetchLatestManimVersion(): Promise<string | undefined> {
    const url = 'https://api.github.com/repos/3b1b/manim/releases/latest';
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github+json',
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            Logger.error(`GitHub API error: ${response.statusText}`);
            return undefined;
        }

        const data: any = await response.json();
        const tag = data.tag_name;
        return tag.startsWith('v') ? tag.substring(1) : tag;
    } catch (error) {
        Logger.error(`Error fetching latest Manim version: ${error}`);
        return undefined;
    }
}

/**
 * Tries to determine the Manim version with the `manimgl --version` command.
 */
export async function tryToDetermineManimVersion(isAtStartup = false) {
    MANIM_VERSION = undefined;
    let res = false;
    isCanceledByUser = false;
    const latestVersionPromise = fetchLatestManimVersion();

    const terminal = await window.createTerminal(
        {
            name: "ManimGL Version",
            iconPath: new vscode.ThemeIcon("tag")
        });
    await waitNewTerminalDelay();

    await window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Determining ManimGL version...",
        cancellable: true,
    }, async (progress, token) => {
        res = await new Promise<boolean>(async (resolve, reject) => {
            progress.report({ increment: 0 });
            const timeoutPromise = constructTimeoutPromise(8000, progress, token);
            const versionPromise = lookForManimVersionString(terminal);
            Promise.race([timeoutPromise, versionPromise])
                .then((couldResolveVersion) => resolve(couldResolveVersion))
                .catch((err) => {
                    Logger.error(`Abnormal termination of ManimGL version determination: ${err}`);
                    resolve(false);
                });
        });
    });

    await showUserFeedbackForVersion(res, terminal, latestVersionPromise, isAtStartup);
}

async function showUserFeedbackForVersion(
    versionCouldBeDetermined: boolean,
    terminal: vscode.Terminal, latestVersionPromise: Promise<string | undefined>,
    isAtStartup: boolean
) {
    if (versionCouldBeDetermined) {
        terminal.dispose();
        const latestVersion = await latestVersionPromise;
        if (latestVersion) {
            if (latestVersion === MANIM_VERSION) {
                window.showInformationMessage(
                    `You're using the latest ManimGL version: v${MANIM_VERSION}`);
            } else {
                window.showInformationMessage(
                    `You're using ManimGL version v${MANIM_VERSION}.`
                    + ` The latest version is v${latestVersion}.`);
            }
        } else {
            window.showInformationMessage(`You're using ManimGL version: v${MANIM_VERSION}`);
        }
    } else if (!isCanceledByUser) {
        terminal.show();
        const tryAgainAnswer = "Try again";
        let errMessage = "Your ManimGL version could not be determined.";
        if (isAtStartup) {
            errMessage += " This can happen at startup since"
                + " a virtual environment might not have been activated yet."
                + " Please try again...";
        }
        const answer = await Window.showErrorMessage(errMessage, tryAgainAnswer);
        if (answer === tryAgainAnswer) {
            await tryToDetermineManimVersion();
        }
    }
}

function constructTimeoutPromise(timeout: number,
    progress: vscode.Progress<unknown>, token: vscode.CancellationToken): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
        const timeoutId = setTimeout(() => {
            clearTimeout(timeoutId);
            reject();
        }, timeout);

        token.onCancellationRequested(() => {
            isCanceledByUser = true;
            clearTimeout(timeoutId);
            reject();
        });

        const numChunks = Math.ceil(timeout / 500);
        for (let i = 0; i < numChunks; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            progress.report({ increment: 100 / numChunks });
        }
    });
}

async function lookForManimVersionString(terminal: vscode.Terminal): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
        onTerminalOutput(terminal, (data: string) => {
            const versionMatch = data.match(/^\s*ManimGL v([0-9]+\.[0-9]+\.[0-9]+)/);
            if (!versionMatch) {
                return;
            }

            MANIM_VERSION = versionMatch[1];
            Logger.info(`👋 ManimGL version found: ${MANIM_VERSION}`);
            terminal.dispose();
            resolve(true);
        });

        window.onDidEndTerminalShellExecution((event) => {
            if (event.terminal !== terminal || MANIM_VERSION || isCanceledByUser) {
                return;
            }
            if (event.exitCode !== 0) {
                Logger.error("ManimGL version detection: shell exited with error code");
                resolve(false);
            }
        });

        terminal.sendText("manimgl --version");
    });
}
