// __tests__/src/chat/context.test.ts
import { ContextBuilder } from '../../src/chat/context.js';
import { IActiveTextEditorProvider, IIgnoreManager, IWorkspaceProvider, IPathResolver } from '../../src/types.js';
import { createMockIgnoreManager, createMockWorkspaceProvider, createMockPathResolver } from '../testUtils.js';
import { jest } from '@jest/globals';

describe('ContextBuilder', () => {
  let mockIgnoreManager: jest.Mocked<IIgnoreManager>;
  let mockWorkspaceProvider: jest.Mocked<IWorkspaceProvider>;
  let mockPathResolver: jest.Mocked<IPathResolver>;

  beforeEach(() => {
    mockIgnoreManager = createMockIgnoreManager();
    mockWorkspaceProvider = createMockWorkspaceProvider();
    mockPathResolver = createMockPathResolver();
    
    // Setup default ignore behavior
    mockIgnoreManager.shouldIgnore.mockImplementation(async (filePath: string) => {
        const ignoredPaths = [
          '/project/root/.venv',
          '/project/root/dist/bundle.js',
          '/project/root/resources/icon.png',
        ];
        return ignoredPaths.includes(filePath);
      });
  });

  it('returns placeholder if no editor or document is available', async () => {
    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: undefined,
    };
    const result = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    expect(result).toBe('[No active editor found. Please open a file to provide context.]');
  });

  it('returns context from the active editor with absolute path when no workspace root', async () => {
    const filePath = '/path/to/mock/file.ts';
    const fileContent = 'This is the content of the mock file.';
    mockWorkspaceProvider.rootPath.mockReturnValue(undefined);

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

    const result = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    const expectedContext = `Context from file:\n[Path: ${filePath}]\n${fileContent}`;

    expect(result).toBe(expectedContext);
  });

  it('returns context from the active editor with relative path when workspace root is available', async () => {
    const rootPath = '/project/root';
    const filePath = '/project/root/src/file.ts';
    const fileContent = 'This is the content of the mock file.';

    mockWorkspaceProvider.rootPath.mockReturnValue(rootPath);

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

    const result = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    const expectedContext = `Context from file:\n[Path: src/file.ts]\n${fileContent}`;

    expect(result).toBe(expectedContext);
    expect(mockPathResolver.relative).toHaveBeenCalledWith(rootPath, filePath);
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

    const result = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    expect(result).toBe('[No file path found for the active editor.]');
  });

  it('should return a specific message if the editor is not a file (e.g., Output tab)', async () => {
    const mockDocument = {
      uri: {
        scheme: 'output',
        fsPath: '/some/output/path',
      },
      getText: () => 'Some log content',
    };

    const mockEditor = {
      document: mockDocument,
    };

    const mockProvider: IActiveTextEditorProvider = {
      activeTextEditor: mockEditor,
    };

    const result = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    expect(result).toBe('[Active editor is not a file (e.g., Output tab) and will not be included in context.]');
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

    const context = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    expect(context).toBe(`[File ${filePath} is ignored and will not be included in context.]`);
    expect(mockIgnoreManager.shouldIgnore).toHaveBeenCalledWith(filePath);
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

    const context = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    expect(context).toBe(`[File ${filePath} is ignored and will not be included in context.]`);
    expect(mockIgnoreManager.shouldIgnore).toHaveBeenCalledWith(filePath);
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

    const context = await new ContextBuilder(mockProvider, mockIgnoreManager, mockWorkspaceProvider, mockPathResolver).buildContext();
    expect(context).toBe(`[File ${filePath} is ignored and will not be included in context.]`);
    expect(mockIgnoreManager.shouldIgnore).toHaveBeenCalledWith(filePath);
  });
});