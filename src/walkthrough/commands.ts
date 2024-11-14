import { ExtensionContext, window, workspace, commands } from 'vscode';
import { Logger, Window } from '../logger';
import { ManimShell } from '../manimShell';

export function registerWalkthroughCommands(context: ExtensionContext) {
    const checkManimVersionCommand = commands.registerCommand(
        'manim-notebook-walkthrough.checkManimVersion', async () => {
            Logger.info("💠 Command Check Manim Version requested");
            await checkManimVersion();
        });

    context.subscriptions.push(checkManimVersionCommand);
}

async function checkManimVersion() {
    const terminal = window.createTerminal("Manim Version");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    terminal.sendText("manimgl --version");
}
