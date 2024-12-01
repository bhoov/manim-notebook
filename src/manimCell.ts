import * as vscode from 'vscode';
import { window } from 'vscode';
import { ManimCellRanges } from './manimCellRanges';

export class ManimCell implements vscode.CodeLensProvider, vscode.FoldingRangeProvider {
    private cellStartCommentDecoration: vscode.TextEditorDecorationType;
    private cellTopDecoration: vscode.TextEditorDecorationType;
    private cellBottomDecoration: vscode.TextEditorDecorationType;
    private cellTopDecorationUnfocused: vscode.TextEditorDecorationType;
    private cellBottomDecorationUnfocused: vscode.TextEditorDecorationType;

    constructor() {
        this.cellStartCommentDecoration = window.createTextEditorDecorationType({
            isWholeLine: true,
            fontWeight: 'bold',
            color: new vscode.ThemeColor('manimNotebookColors.baseColor')
        });
        this.cellTopDecoration = ManimCell.getBorder(true, true);
        this.cellBottomDecoration = ManimCell.getBorder(true, false);
        this.cellTopDecorationUnfocused = ManimCell.getBorder(false, true);
        this.cellBottomDecorationUnfocused = ManimCell.getBorder(false, false);
    }

    private static getBorder(isFocused = true, isTop = true): vscode.TextEditorDecorationType {
        const borderColor = isFocused
            ? 'manimNotebookColors.baseColor'
            : 'manimNotebookColors.unfocused';
        const borderWidth = isTop ? '2px 0px 0px 0px' : '0px 0px 1.6px 0px';
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
        if (!window.activeTextEditor) {
            return codeLens;
        }

        const document = window.activeTextEditor?.document;
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

        const config = vscode.workspace.getConfiguration("manim-notebook");

        // Start comment in bold
        if (config.get("typesetStartCommentInBold")) {
            editor.setDecorations(this.cellStartCommentDecoration,
                topRangesFocused.concat(topRangesUnfocused));
        } else {
            editor.setDecorations(this.cellStartCommentDecoration, []);
        }

        // Cell borders
        if (config.get("showCellBorders")) {
            editor.setDecorations(this.cellTopDecoration, topRangesFocused);
            editor.setDecorations(this.cellBottomDecoration, bottomRangesFocused);
            editor.setDecorations(this.cellTopDecorationUnfocused, topRangesUnfocused);
            editor.setDecorations(this.cellBottomDecorationUnfocused, bottomRangesUnfocused);
        } else {
            editor.setDecorations(this.cellTopDecoration, []);
            editor.setDecorations(this.cellBottomDecoration, []);
            editor.setDecorations(this.cellTopDecorationUnfocused, []);
            editor.setDecorations(this.cellBottomDecorationUnfocused, []);
        }
    }

}
