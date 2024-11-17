import { ExtensionContext, window, workspace, commands, extensions } from 'vscode';
import { Logger, Window } from '../logger';
import { ManimShell } from '../manimShell';
import fs from 'fs';
import path from 'path';

export function registerWalkthroughCommands(context: ExtensionContext) {
    const checkManimVersionCommand = commands.registerCommand(
        'manim-notebook-walkthrough.checkManimVersion', async () => {
            Logger.info("💠 Command Check Manim Version requested");
            await checkManimVersion();
        });

    const openSampleFileCommand = commands.registerCommand(
        'manim-notebook-walkthrough.openSample', async () => {
            Logger.info("💠 Command Open Sample File requested");
            await openSampleFile(context);
        });

    const showAllCommandsCommand = commands.registerCommand(
        'manim-notebook-walkthrough.showCommands', async () => {
            Logger.info("💠 Command Show All Commands requested");
            await showAllCommands();
        }
    );

    context.subscriptions.push(
        checkManimVersionCommand,
        openSampleFileCommand,
        showAllCommandsCommand);
}

async function checkManimVersion() {
    const terminal = window.createTerminal("Manim Version");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    terminal.sendText("manimgl --version");
}

/**
 * Opens a sample Manim file in a new editor that the user can use to get started.
 * 
 * @param context The extension context.
 */
async function openSampleFile(context: ExtensionContext) {
    const sampleFilePath = path.join(context.extensionPath,
        'src', 'walkthrough', 'sample_scene.py');
    const sampleFileContent = fs.readFileSync(sampleFilePath, 'utf-8');

    const sampleFile = await workspace.openTextDocument({
        language: 'python',
        content: sampleFileContent
    });

    await window.showTextDocument(sampleFile);
}

/**
 * Opens the command palette with all the "Manim Notebook" commands.
 */
async function showAllCommands() {
    await commands.executeCommand('workbench.action.quickOpen', '>Manim Notebook:');
}
