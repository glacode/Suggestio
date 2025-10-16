
import * as vscode from 'vscode';

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
