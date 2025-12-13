/**
 * Extracts a prefix of text from a VSCode document, considering a maximum number of lines
 * before the current cursor position.
 * 
 * @param document - The VSCode text document to extract text from
 * @param position - The current cursor position in the document
 * @param maxLines - Maximum number of lines to look back (defaults to 100)
 * @returns A string containing the extracted text, with lines joined by newline characters
 * 
 * @example
 * ```typescript
 * const prefix = extractPrefix(document, position, 50);
 * // Returns text from up to 50 lines before cursor position
 * ```
 */
import * as vscode from 'vscode';

export function extractPrefix(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxLines = 200
): string {
  const startLine = Math.max(0, position.line - maxLines + 1);
  const lines: string[] = [];

  for (let i = startLine; i <= position.line; i++) {
    const lineText = document.lineAt(i).text;
    lines.push(i === position.line ? lineText.substring(0, position.character) : lineText);
  }

  return lines.join('\n');
}

export function extractSuffix(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxLines = 2
): string {
  // Start from the current line and go down
  const endLine = Math.min(document.lineCount - 1, position.line + maxLines);
  const lines: string[] = [];

  for (let i = position.line; i <= endLine; i++) {
    const lineText = document.lineAt(i).text;
    // If it's the current line, take text FROM the cursor to the end
    // Otherwise, take the whole line
    lines.push(i === position.line ? lineText.substring(position.character) : lineText);
  }

  return lines.join('\n');
}