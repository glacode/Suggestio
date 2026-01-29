import { describe, it, expect, beforeEach } from '@jest/globals';
import { readConfig } from '../../src/config/config.js';
import { IExtensionContextMinimal } from '../../src/types.js';
import { createMockWorkspaceProvider, createMockFileContentReader, createMockDirectoryReader, createMockWindowProvider, createMockPathResolver } from '../testUtils.js';

describe('readConfig', () => {
    let mockContext: IExtensionContextMinimal;
    let mockWorkspaceProvider: ReturnType<typeof createMockWorkspaceProvider>;
    let mockFileProvider: ReturnType<typeof createMockFileContentReader>;
    let mockDirectoryProvider: ReturnType<typeof createMockDirectoryReader>;
    let mockWindowProvider: ReturnType<typeof createMockWindowProvider>;
    let mockPathResolver: ReturnType<typeof createMockPathResolver>;

    beforeEach(() => {
        mockContext = {
            extensionUri: { fsPath: '/path/to/extension', toString: () => '/path/to/extension' },
            globalStorageUri: { fsPath: '/path/to/globalStorage', toString: () => '/path/to/globalStorage' }
        };

        mockWorkspaceProvider = createMockWorkspaceProvider();
        mockFileProvider = createMockFileContentReader();
        mockDirectoryProvider = createMockDirectoryReader();
        mockWindowProvider = createMockWindowProvider();
        mockPathResolver = createMockPathResolver();
    });

    it('should read the workspace config if it exists', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue('/path/to/workspace');
        mockDirectoryProvider.exists.mockReturnValue(true);
        mockFileProvider.read.mockReturnValue('{}');

        await readConfig(
            mockContext,
            mockWorkspaceProvider,
            mockFileProvider,
            mockDirectoryProvider,
            mockWindowProvider,
            mockPathResolver
        );

        expect(mockFileProvider.read).toHaveBeenCalledWith('/path/to/workspace/suggestio.config.json');
    });

    it('should read the global config if the workspace config does not exist', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue('/path/to/workspace');
        mockDirectoryProvider.exists.mockImplementation((path) => path === '/path/to/globalStorage/config.json');
        mockFileProvider.read.mockReturnValue('{}');

        await readConfig(
            mockContext,
            mockWorkspaceProvider,
            mockFileProvider,
            mockDirectoryProvider,
            mockWindowProvider,
            mockPathResolver
        );

        expect(mockFileProvider.read).toHaveBeenCalledWith('/path/to/globalStorage/config.json');
    });

    it('should read the default config if no other config exists', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue(undefined);
        mockDirectoryProvider.exists.mockReturnValue(false);
        mockFileProvider.read.mockReturnValue('{}');

        await readConfig(
            mockContext,
            mockWorkspaceProvider,
            mockFileProvider,
            mockDirectoryProvider,
            mockWindowProvider,
            mockPathResolver
        );

        expect(mockFileProvider.read).toHaveBeenCalledWith('/path/to/extension/config.json');
    });

    it('should return a default config if reading the file fails', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue(undefined);
        mockDirectoryProvider.exists.mockReturnValue(true);
        mockFileProvider.read.mockImplementation(() => {
            throw new Error('Failed to read file');
        });

        const config = await readConfig(
            mockContext,
            mockWorkspaceProvider,
            mockFileProvider,
            mockDirectoryProvider,
            mockWindowProvider,
            mockPathResolver
        );

        expect(JSON.parse(config)).toEqual({
            activeProvider: '',
            providers: {},
            anonymizer: { enabled: false, words: [] }
        });
        expect(mockWindowProvider.showErrorMessage).toHaveBeenCalledWith('Failed to load config.json: Error: Failed to read file');
    });
});
