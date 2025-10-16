// __tests__/src/chat/context.test.ts
import { buildContext } from '../../../src/chat/context.js'; // adjust relative path
import * as vscode from 'vscode';


describe('buildContext', () => {
  it('returns placeholder if no editor or document is available', () => {
    (vscode.window.activeTextEditor as any) = undefined;
    const result = buildContext();
    expect(result).toBe('[No active editor found. Please open a file to provide context.]');
  });
});
