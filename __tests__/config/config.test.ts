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

    it('should read both config layers if they exist', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue('/path/to/workspace');
        mockDirectoryProvider.exists.mockReturnValue(true);
        mockFileProvider.read.mockImplementation((path) => {
            if (path.includes('extension')) { return '{"layer": "default"}'; }
            if (path.includes('workspace')) { return '{"layer": "workspace"}'; }
            return '{}';
        });

        const configs = await readConfig(
            mockContext,
            mockWorkspaceProvider,
            mockFileProvider,
            mockDirectoryProvider,
            mockWindowProvider,
            mockPathResolver
        );

        expect(configs.default).toBe('{"layer": "default"}');
        expect(configs.workspaceJsonConfigFile).toBe('{"layer": "workspace"}');
    });

    it('should return empty workspace if it does not exist', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue('/path/to/workspace');
        mockDirectoryProvider.exists.mockImplementation((path) => path.includes('extension'));
        mockFileProvider.read.mockReturnValue('{"layer": "default"}');

        const configs = await readConfig(
            mockContext,
            mockWorkspaceProvider,
            mockFileProvider,
            mockDirectoryProvider,
            mockWindowProvider,
            mockPathResolver
        );

        expect(configs.default).toBe('{"layer": "default"}');
        expect(configs.workspaceJsonConfigFile).toBeUndefined();
    });

    it('should return a fallback default config if reading the default file fails', async () => {
        mockWorkspaceProvider.rootPath.mockReturnValue(undefined);
        mockDirectoryProvider.exists.mockReturnValue(true);
        mockFileProvider.read.mockImplementation(() => {
            throw new Error('Failed to read file');
        });

        const configs = await readConfig(
            mockContext,
            mockWorkspaceProvider,
            mockFileProvider,
            mockDirectoryProvider,
            mockWindowProvider,
            mockPathResolver
        );

        expect(JSON.parse(configs.default)).toEqual({
            profiles: {},
            anonymizer: { enabled: false, words: [] }
        });
        expect(mockWindowProvider.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Default config: Error: Failed to read file'));
    });
});
