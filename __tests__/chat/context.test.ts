// __tests__/src/chat/context.test.ts
import { ContextBuilder } from '../../src/chat/context.js';
import { IActiveTextEditorProvider } from '../../src/chat/types.js';

describe('buildContext', () => {
  it('returns placeholder if no editor or document is available', () => {
    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: undefined,
    };
    const result = new ContextBuilder(mockProvider).buildContext();
    expect(result).toBe('[No active editor found. Please open a file to provide context.]');
  });

  it('returns context from the active editor', () => {
    const mockDocument = {
      uri: {
        fsPath: '/path/to/mock/file.ts',
      },
      getText: () => 'This is the content of the mock file.',
    };

    const mockEditor = {
      document: mockDocument,
    };

    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: mockEditor,
    };

    const result = new ContextBuilder(mockProvider).buildContext();
    const expectedContext = `Context from file:
[Path: /path/to/mock/file.ts]
This is the content of the mock file.`;

    expect(result).toBe(expectedContext);
  });
});