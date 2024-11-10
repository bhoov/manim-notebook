import * as vscode from 'vscode';

export class ManimCellRanges {

    /**
     * Regular expression to match the start of a Manim cell.
     * 
     * The marker is a comment line starting with "##". Since the comment might
     * be indented, we allow for any number of leading whitespaces.
     * 
     * Manim cells themselves might contain further comments, but no nested
     * Manim cells, i.e. no further comment starting with "##".
     */
    private static readonly MARKER = /^(\s*##)/;

    /**
     * Calculates the ranges of Manim cells in the given document.
     * 
     * A new Manim cell starts at a custom MARKER. The cell ends either:
     * - when the next line starts with the MARKER
     * - when the indentation level decreases
     * - at the end of the document
     * 
     * This method is performance-intensive as it has to go through every single
     * line of the document. Despite this, we call it many times and caching
     * could be beneficial in the future.
     */
    public static calculateRanges(document: vscode.TextDocument): vscode.Range[] {
        const ranges: vscode.Range[] = [];
        let start: number | null = null;
        let startIndent: number | null = null;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (line.isEmptyOrWhitespace) {
                continue;
            }

            const currentIndent = line.firstNonWhitespaceCharacterIndex;

            if (ManimCellRanges.MARKER.test(line.text)) {
                if (start !== null) {
                    ranges.push(this.getRangeDiscardEmpty(document, start, i - 1));
                }
                start = i;
                startIndent = currentIndent;
            } else if (start !== null && startIndent !== null && startIndent > currentIndent) {
                ranges.push(this.getRangeDiscardEmpty(document, start, i - 1));
                start = null;
                startIndent = null;
            }
        }

        // Range for the last cell when the document ends
        if (start !== null) {
            ranges.push(this.getRangeDiscardEmpty(document, start, document.lineCount - 1));
        }

        return ranges;
    }

    /**
     * Returns the cell range that contains the given line number.
     * 
     * Returns null if no cell range contains the line, e.g. if the cursor is
     * outside of a Manim cell.
     */
    public static getCellRangeAtLine(document: vscode.TextDocument, line: number): vscode.Range | null {
        const ranges = ManimCellRanges.calculateRanges(document);
        for (const range of ranges) {
            if (range.start.line <= line && line <= range.end.line) {
                return range;
            }
        }
        return null;
    }

    /**
     * Constructs a new cell range from the given start and end line numbers.
     * Discards all trailing empty lines at the end of the range.
     */
    private static getRangeDiscardEmpty(
        document: vscode.TextDocument, start: number, end: number
    ): vscode.Range {
        let endNew = end;
        while (endNew > start && document.lineAt(endNew).isEmptyOrWhitespace) {
            endNew--;
        }
        return new vscode.Range(start, 0, endNew, document.lineAt(endNew).text.length);
    }

}

interface ClassLine {
    line: string;
    lineNumber: number;
    className: string;
}

/**
 * Returns the lines that define Python classes in the given document.
 * 
 * TODO: Only trigger on actual Manim classes, not all Python classes.
 * 
 * @param document The document to search in.
 */
export function findClassLines(document: vscode.TextDocument) : ClassLine[] {
    const lines = document.getText().split("\n");

    const classLines: ClassLine[] = [];
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const line = lines[lineNumber];
        const match = line.match(/^\s*class\s+(.+?)[(:]/);
        if (match) {
            classLines.push({ line, lineNumber, className: match[1] });
        }
    }

    return classLines;
}
