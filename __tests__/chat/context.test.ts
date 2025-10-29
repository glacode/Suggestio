// __tests__/src/chat/context.test.ts
import { buildContext } from '../../src/chat/context.js'; // adjust relative path
import { activeEditorTracker } from '../../src/chat/activeEditorTracker.js';
import { jest } from '@jest/globals';

describe('buildContext', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns placeholder if no editor or document is available', () => {
    jest.spyOn(activeEditorTracker, 'lastActiveEditor', 'get').mockReturnValue(undefined);
    const result = buildContext();
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
    } as any;

    jest.spyOn(activeEditorTracker, 'lastActiveEditor', 'get').mockReturnValue(mockEditor);

    const result = buildContext();
    const expectedContext = `Context from file:
[Path: /path/to/mock/file.ts]
This is the content of the mock file.`;

    expect(result).toBe(expectedContext);
  });
});