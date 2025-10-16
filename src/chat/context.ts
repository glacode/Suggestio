/**
 * Build context string from the active VSCode editor.
 * Includes file path and full content if available.
 */
import { activeEditorTracker } from './activeEditorTracker.js';


/**
 * Build context string from VSCode.
 * Tries active editor first.
 */
export function buildContext(): string {
    const editor = activeEditorTracker.lastActiveEditor;

    if (!editor) {
        return '[No active editor found. Please open a file to provide context.]';
    }

    const doc = editor.document;
    const filePath = doc.uri.fsPath;
    const fileContent = doc.getText();

    return `Context from file:\n[Path: ${filePath}]\n${fileContent}`;
}

