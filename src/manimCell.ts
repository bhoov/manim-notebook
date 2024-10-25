import * as vscode from 'vscode';
import { window } from 'vscode';
import { ManimCellRanges } from './manimCellRanges';

export class ManimCell implements vscode.CodeLensProvider, vscode.FoldingRangeProvider {
    private cellTopDecoration: vscode.TextEditorDecorationType;
    private cellBottomDecoration: vscode.TextEditorDecorationType;
    private cellTopDecorationUnfocused: vscode.TextEditorDecorationType;
    private cellBottomDecorationUnfocused: vscode.TextEditorDecorationType;

    constructor() {
        this.cellTopDecoration = ManimCell.getBorder(true, true);
        this.cellBottomDecoration = ManimCell.getBorder(true, false);
        this.cellTopDecorationUnfocused = ManimCell.getBorder(false, true);
        this.cellBottomDecorationUnfocused = ManimCell.getBorder(false, false);
    }

    private static getBorder(isFocused = true, isTop = true): vscode.TextEditorDecorationType {
        const borderColor = isFocused ? 'interactive.activeCodeBorder' : 'interactive.inactiveCodeBorder';
        const borderWidth = isTop ? '1.5px 0px 0px 0px' : '0px 0px 1.5px 0px';
        return window.createTextEditorDecorationType({
            borderColor: new vscode.ThemeColor(borderColor),
            borderWidth: borderWidth,
            borderStyle: 'solid',
            isWholeLine: true
        });
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        const ranges = ManimCellRanges.calculateRanges(document);
        for (const range of ranges) {
            codeLenses.push(new vscode.CodeLens(range));
        }

        return codeLenses;
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
        if (!vscode.window.activeTextEditor) {
            return codeLens;
        }

        const document = vscode.window.activeTextEditor?.document;
        const range = new vscode.Range(codeLens.range.start, codeLens.range.end);
        const cellCode = document.getText(range);

        codeLens.command = {
            title: "▶ Preview Manim Cell",
            command: "manim-notebook.previewManimCell",
            tooltip: "Preview this Manim Cell inside an interactive Manim environment",
            arguments: [cellCode, codeLens.range.start.line]
        };

        return codeLens;
    }

    public provideFoldingRanges(document: vscode.TextDocument, context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.FoldingRange[] {
        const ranges = ManimCellRanges.calculateRanges(document);
        return ranges.map(range => new vscode.FoldingRange(range.start.line, range.end.line));
    }

    public applyCellDecorations(editor: vscode.TextEditor) {
        const document = editor.document;
        const ranges = ManimCellRanges.calculateRanges(document);
        const topRangesFocused: vscode.Range[] = [];
        const bottomRangesFocused: vscode.Range[] = [];
        const topRangesUnfocused: vscode.Range[] = [];
        const bottomRangesUnfocused: vscode.Range[] = [];

        const cursorPosition = editor.selection.active;

        ranges.forEach(range => {
            const isCursorInRange = range.contains(cursorPosition);
            const topRange = new vscode.Range(range.start.line, 0, range.start.line, 0);
            const bottomRange = new vscode.Range(range.end.line, 0, range.end.line, 0);

            if (isCursorInRange) {
                topRangesFocused.push(topRange);
                bottomRangesFocused.push(bottomRange);
            } else {
                topRangesUnfocused.push(topRange);
                bottomRangesUnfocused.push(bottomRange);
            }
        });

        editor.setDecorations(this.cellTopDecoration, topRangesFocused);
        editor.setDecorations(this.cellBottomDecoration, bottomRangesFocused);
        editor.setDecorations(this.cellTopDecorationUnfocused, topRangesUnfocused);
        editor.setDecorations(this.cellBottomDecorationUnfocused, bottomRangesUnfocused);
    }

}
