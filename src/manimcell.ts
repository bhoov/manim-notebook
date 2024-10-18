import * as vscode from 'vscode';
import { window } from 'vscode';

export class ManimCell implements vscode.CodeLensProvider, vscode.FoldingRangeProvider {
    private static readonly MARKER = /^(\s*##)/;
    private cellTopDecoration: vscode.TextEditorDecorationType;
    private cellBottomDecoration: vscode.TextEditorDecorationType;

    constructor() {
        this.cellTopDecoration = window.createTextEditorDecorationType({
            borderColor: new vscode.ThemeColor('interactive.activeCodeBorder'),
            borderWidth: '1.5px 0px 0px 0px',
            borderStyle: 'solid',
            isWholeLine: true
        });
        this.cellBottomDecoration = window.createTextEditorDecorationType({
            borderColor: new vscode.ThemeColor('interactive.activeCodeBorder'),
            borderWidth: '0px 0px 1.5px 0px',
            borderStyle: 'solid',
            isWholeLine: true
        });
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (ManimCell.MARKER.test(line.text)) {
                const range = new vscode.Range(i, 0, i, line.text.length);
                codeLenses.push(new vscode.CodeLens(range));
            }
        }

        return codeLenses;
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
        codeLens.command = {
            title: "Preview Manim",
            command: "vscode-manim.previewManimCell",
            arguments: []
        };
        return codeLens;
    }

    public provideFoldingRanges(document: vscode.TextDocument, context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.FoldingRange[] {
        const ranges = this.calculateCellRanges(document);
        return ranges.map(range => new vscode.FoldingRange(range.start.line, range.end.line));
    }

    public applyCellDecorations(editor: vscode.TextEditor) {
        const ranges = this.calculateCellRanges(editor.document);
        const topRanges: vscode.Range[] = [];
        const bottomRanges: vscode.Range[] = [];

        const visibleRanges = editor.visibleRanges;
        ranges.forEach(range => {
            const isEndLineVisible = visibleRanges.some(visibleRange => visibleRange.contains(range.end));
            if (isEndLineVisible) {
                topRanges.push(new vscode.Range(range.start.line, 0, range.start.line, 0));
                bottomRanges.push(new vscode.Range(range.end.line, 0, range.end.line, 0));
            }
        });

        editor.setDecorations(this.cellTopDecoration, topRanges);
        editor.setDecorations(this.cellBottomDecoration, bottomRanges);
    }

    private calculateCellRanges(document: vscode.TextDocument): vscode.Range[] {
        const ranges: vscode.Range[] = [];
        let start: number | null = null;
        let startIndent: number | null = null;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);

            if (line.isEmptyOrWhitespace) {
                continue;
            }

            const currentIndent = line.firstNonWhitespaceCharacterIndex;

            if (ManimCell.MARKER.test(line.text)) {
                if (start !== null) {
                    ranges.push(this.constructNewRange(start, i - 1, document));
                }
                start = i;
                startIndent = currentIndent;
            } else if (start !== null && startIndent !== null && startIndent !== currentIndent) {
                ranges.push(this.constructNewRange(start, i - 1, document));
                start = null;
                startIndent = null;
            }
        }

        if (start !== null) {
            ranges.push(this.constructNewRange(start, document.lineCount - 1, document));
        }

        return ranges;
    }

    private constructNewRange(start: number, end: number, document: vscode.TextDocument): vscode.Range {
        let endLine = document.lineAt(end);
        const endNew = endLine.isEmptyOrWhitespace ? end - 1 : end;
        if (endNew !== end) {
            endLine = document.lineAt(endNew);
        }
        return new vscode.Range(start, 0, endNew, endLine.text.length);
    }
}