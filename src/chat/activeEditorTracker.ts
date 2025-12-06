
import * as vscode from 'vscode';

//TODO this class is not used anymore, if the new context builder works well, we can delete it
/**
 * `ActiveEditorTracker` tracks the last active text editor in VSCode.
 * It listens to changes in the active editor and updates its state accordingly.
 */
export
class ActiveEditorTracker {
    private _lastActiveEditor: vscode.TextEditor | undefined;

    constructor() {
        // Set the initial active editor
        this._lastActiveEditor = vscode.window.activeTextEditor;

        // Listen for changes to the active editor
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this._lastActiveEditor = editor;
            }
        });
    }

    public get lastActiveEditor(): vscode.TextEditor | undefined {
        return this._lastActiveEditor;
    }
}

export const activeEditorTracker = new ActiveEditorTracker();
