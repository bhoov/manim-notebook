import { window } from 'vscode';

export const loggerName = 'Manim Notebook';
export const logger = window.createOutputChannel(loggerName, { log: true });
