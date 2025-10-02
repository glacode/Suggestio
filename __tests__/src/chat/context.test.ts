// __tests__/src/chat/context.test.ts
import { buildContext } from '../../../src/chat/context.js'; // adjust relative path
import * as vscode from 'vscode';

// helper to make a fake TextDocument
function makeDoc(path: string, content: string): vscode.TextDocument {
  return {
    uri: { fsPath: path } as any,
    getText: () => content,
  } as vscode.TextDocument;
}

describe('buildContext', () => {
  beforeEach(() => {
    // reset mocked vscode state
    (vscode.window.activeTextEditor as any) = undefined;
    (vscode.window.visibleTextEditors as any) = [];
    (vscode.workspace.textDocuments as any) = [];
  });

  it('returns context from active editor if available', () => {
    const doc = makeDoc('/active/file.ts', 'active content');
    (vscode.window.activeTextEditor as any) = { document: doc };

    const result = buildContext();
    expect(result).toContain('/active/file.ts');
    expect(result).toContain('active content');
  });

  it('falls back to first visible editor if no active editor', () => {
    const doc = makeDoc('/visible/file.ts', 'visible content');
    (vscode.window.visibleTextEditors as any) = [{ document: doc }];

    const result = buildContext();
    expect(result).toContain('/visible/file.ts');
    expect(result).toContain('visible content');
  });

  it('falls back to last opened text document if no active or visible editor', () => {
    const doc1 = makeDoc('/doc1.ts', 'doc1 content');
    const doc2 = makeDoc('/doc2.ts', 'doc2 content');
    (vscode.workspace.textDocuments as any) = [doc1, doc2];

    const result = buildContext();
    expect(result).toContain('/doc2.ts'); // last doc
    expect(result).toContain('doc2 content');
  });

  it('returns placeholder if no editor or document is available', () => {
    const result = buildContext();
    expect(result).toBe('[No active editor or open text document]');
  });
});
