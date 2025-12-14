/**
 * Build context string from the active VSCode editor.
 * Includes file path and full content if available.
 */
import { IContextBuilder, IActiveTextEditorProvider, IIgnoreManager } from './types.js';

/**
 * Default implementation of `IContextBuilder` that reads from the
 * current active editor via an injected `IActiveTextEditorProvider`.
 */
export class ContextBuilder implements IContextBuilder {
    constructor(
        private readonly editorProvider: IActiveTextEditorProvider,
        private readonly ignoreManager: IIgnoreManager,
    ) {}

    async buildContext(): Promise<string> {
        const editor = this.editorProvider.activeTextEditor;

        if (!editor) {
            return '[No active editor found. Please open a file to provide context.]';
        }

        const doc = editor.document;
        const filePath = doc.uri.fsPath;

        if (!filePath) {
            return '[No file path found for the active editor.]';
        }

        const shouldIgnore = await this.ignoreManager.shouldIgnore(filePath);
        if (shouldIgnore) {
            return `[File ${filePath} is ignored and will not be included in context.]`;
        }

        const fileContent = doc.getText();

        return `Context from file:\n[Path: ${filePath}]\n${fileContent}`;
    }
}