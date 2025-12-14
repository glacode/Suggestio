// __tests__/src/chat/context.test.ts
import { ContextBuilder } from '../../src/chat/context.js';
import { IActiveTextEditorProvider, IIgnoreManager } from '../../src/types.js';

describe('ContextBuilder', () => {
  let mockIgnoreManager: IIgnoreManager;
  let shouldIgnoreCalledWith: string[] = [];

  beforeEach(() => {
    shouldIgnoreCalledWith = []; // Reset the spy before each test
    mockIgnoreManager = {
      shouldIgnore: async (filePath: string) => {
        shouldIgnoreCalledWith.push(filePath);
        const ignoredPaths = [
          '/project/root/.venv',
          '/project/root/dist/bundle.js',
          '/project/root/resources/icon.png',
        ];
        return ignoredPaths.includes(filePath);
      },
    };
  });

  it('returns placeholder if no editor or document is available', async () => {
    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: undefined,
    };
    const result = await new ContextBuilder(mockProvider, mockIgnoreManager).buildContext();
    expect(result).toBe('[No active editor found. Please open a file to provide context.]');
  });

  it('returns context from the active editor', async () => {
    const filePath = '/path/to/mock/file.ts';
    const fileContent = 'This is the content of the mock file.';

    const mockDocument = {
      uri: {
        fsPath: filePath,
      },
      getText: () => fileContent,
    };

    const mockEditor = {
      document: mockDocument,
    };

    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: mockEditor,
    };

    const result = await new ContextBuilder(mockProvider, mockIgnoreManager).buildContext();
    const expectedContext = `Context from file:\n[Path: ${filePath}]\n${fileContent}`;

    expect(result).toBe(expectedContext);
  });

  it('should return a specific message if no file path is found', async () => {
    const mockDocument = {
      uri: {
        fsPath: undefined, // Simulate no fsPath
      },
      getText: () => 'Some content',
    };

    const mockEditor = {
      document: mockDocument,
    };

    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: mockEditor,
    };

    const result = await new ContextBuilder(mockProvider, mockIgnoreManager).buildContext();
    expect(result).toBe('[No file path found for the active editor.]');
  });

  it('should exclude the .venv file', async () => {
    const filePath = '/project/root/.venv';
    const fileContent = 'some virtual env content';

    const mockDocument = {
      uri: {
        fsPath: filePath,
      },
      getText: () => fileContent,
    };

    const mockEditor = {
      document: mockDocument,
    };

    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: mockEditor,
    };

    const context = await new ContextBuilder(mockProvider, mockIgnoreManager).buildContext();
    expect(context).toBe(`[File ${filePath} is ignored and will not be included in context.]`);
    expect(shouldIgnoreCalledWith).toContain(filePath);
  });

  it('should exclude files listed in .gitignore (e.g., build artifacts)', async () => {
    const filePath = '/project/root/dist/bundle.js';
    const fileContent = 'var x = 1; /* minified js */';

    const mockDocument = {
      uri: {
        fsPath: filePath,
      },
      getText: () => fileContent,
    };

    const mockEditor = {
      document: mockDocument,
    };

    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: mockEditor,
    };

    const context = await new ContextBuilder(mockProvider, mockIgnoreManager).buildContext();
    expect(context).toBe(`[File ${filePath} is ignored and will not be included in context.]`);
    expect(shouldIgnoreCalledWith).toContain(filePath);
  });

  it('should exclude files listed in .vscodeignore', async () => {
    const filePath = '/project/root/resources/icon.png';
    const fileContent = 'binary_image_data_here';

    const mockDocument = {
      uri: {
        fsPath: filePath,
      },
      getText: () => fileContent,
    };

    const mockEditor = {
      document: mockDocument,
    };

    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: mockEditor,
    };

    const context = await new ContextBuilder(mockProvider, mockIgnoreManager).buildContext();
    expect(context).toBe(`[File ${filePath} is ignored and will not be included in context.]`);
    expect(shouldIgnoreCalledWith).toContain(filePath);
  });
});