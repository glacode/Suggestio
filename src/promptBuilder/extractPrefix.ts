import * as vscode from 'vscode';

export function extractPrefix(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxLines = 10
): string {
  const startLine = Math.max(0, position.line - maxLines);
  const lines: string[] = [];

  for (let i = startLine; i <= position.line; i++) {
    const lineText = document.lineAt(i).text;
    lines.push(i === position.line ? lineText.substring(0, position.character) : lineText);
  }

  return lines.join('\n').trim();
}
