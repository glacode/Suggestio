/**
 * Build context string from the active VSCode editor.
 * Includes file path and full content if available.
 */
import { activeEditorTracker } from './activeEditorTracker.js';
import { IContextBuilder } from './types.js';

/**
 * Default implementation of `IContextBuilder` that reads from the
 * current (or last known) active editor via `activeEditorTracker`.
 */
export class ContextBuilder implements IContextBuilder {
    constructor(private readonly tracker = activeEditorTracker) {}

    buildContext(): string {
        const editor = this.tracker.lastActiveEditor;

        if (!editor) {
            return '[No active editor found. Please open a file to provide context.]';
        }

        const doc = editor.document;
        const filePath = doc.uri.fsPath;
        const fileContent = doc.getText();

        return `Context from file:\n[Path: ${filePath}]\n${fileContent}`;
    }
}
