/**
 * Build context string from the active VSCode editor.
 * Includes file path and full content if available.
 */
import * as vscode from 'vscode';

/**
 * Build context string from VSCode.
 * Tries active editor first, then falls back to visible editors or open documents.
 */
export function buildContext(): string {
    let doc: vscode.TextDocument | undefined;

    // 1. Try active editor
    if (vscode.window.activeTextEditor) {
        doc = vscode.window.activeTextEditor.document;
    }

    // 2. Fallback: first visible editor
    if (!doc && vscode.window.visibleTextEditors.length > 0) {
        doc = vscode.window.visibleTextEditors[0].document;
    }

    // 3. Fallback: last opened text document
    if (!doc && vscode.workspace.textDocuments.length > 0) {
        doc = vscode.workspace.textDocuments[vscode.workspace.textDocuments.length - 1];
    }

    if (!doc) {
        return '[No active editor or open text document]';
    }

    const filePath = doc.uri.fsPath;
    const fileContent = doc.getText();

    return `Context from file:\n[Path: ${filePath}]\n${fileContent}`;
}

