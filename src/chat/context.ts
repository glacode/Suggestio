/**
 * Build context string from the active VSCode editor.
 * Includes file path and full content if available.
 */
import { IContextBuilder, IActiveTextEditorProvider } from './types.js';

/**
 * Default implementation of `IContextBuilder` that reads from the
 * current active editor via an injected `IEditorProvider`.
 */
export class ContextBuilder implements IContextBuilder {
    constructor(private readonly editorProvider: IActiveTextEditorProvider ) {}

    buildContext(): string {
        const editor = this.editorProvider.activeTextEditor;

        if (!editor) {
            return '[No active editor found. Please open a file to provide context.]';
        }

        const doc = editor.document;
        const filePath = doc.uri.fsPath;
        const fileContent = doc.getText();

        return `Context from file:\n[Path: ${filePath}]\n${fileContent}`;
    }
}
