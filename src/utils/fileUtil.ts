import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Waits until a file exists on the disk.
 * 
 * By https://stackoverflow.com/a/47764403/
 * 
 * @param filePath The path of the file to wait for.
 * @param timeout The maximum time to wait in milliseconds.
 */
export async function waitUntilFileExists(filePath: string, timeout: number): Promise<void> {
    return new Promise(function (resolve, reject) {
        const timer = setTimeout(function () {
            watcher.close();
            reject();
        }, timeout);

        fs.access(filePath, fs.constants.R_OK, (err) => {
            if (!err) {
                clearTimeout(timer);
                watcher.close();
                resolve();
            }
        });

        const dir = path.dirname(filePath);
        const basename = path.basename(filePath);
        const watcher = fs.watch(dir, function (eventType, filename) {
            if (eventType === 'rename' && filename === basename) {
                clearTimeout(timer);
                watcher.close();
                resolve();
            }
        });
    });
}

/**
 * Opens a file in the OS file explorer.
 * 
 * @param uri The URI of the file to reveal.
 */
export async function revealFileInOS(uri: vscode.Uri) {
    if (vscode.env.remoteName === 'wsl') {
        await vscode.commands.executeCommand('remote-wsl.revealInExplorer', uri);
    } else {
        await vscode.commands.executeCommand('revealFileInOS', uri);
    }
}
