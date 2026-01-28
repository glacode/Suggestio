
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { readConfig } from '../../src/config/config.js';

type FsModule = {
    existsSync: (path: fs.PathLike) => boolean;
    readFileSync: (path: fs.PathOrFileDescriptor, options: BufferEncoding) => string;
};

type VscodeModule = {
    workspace: {
        workspaceFolders?: readonly vscode.WorkspaceFolder[];
    };
    window: {
        showErrorMessage: (message: string) => void;
    };
};

describe('readConfig', () => {
    let mockContext: vscode.ExtensionContext;
    let mockFs: FsModule;
    let mockVscode: VscodeModule;

    beforeEach(() => {
        jest.resetAllMocks();
        mockContext = {
            extensionPath: '/path/to/extension',
            globalStorageUri: { fsPath: '/path/to/globalStorage', toString: () => '/path/to/globalStorage' } as vscode.Uri,
            extensionUri: { fsPath: '/path/to/extension', toString: () => '/path/to/extension' } as vscode.Uri,
            environmentVariableCollection: {} as any,
            extensionMode: 1,
            logUri: { fsPath: '/path/to/logs', toString: () => '/path/to/logs' } as vscode.Uri,
            storageUri: { fsPath: '/path/to/storage', toString: () => '/path/to/storage' } as vscode.Uri,
            globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(), setKeysForSync: jest.fn() },
            workspaceState: { get: jest.fn(), update: jest.fn(), keys: jest.fn() },
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn(), keys: jest.fn() },
            subscriptions: [],
            asAbsolutePath: (p: string) => p,
                        languageModelAccessInformation: { onDidChangeLanguageModelAccess: jest.fn(), canSendRequest: jest.fn(), onDidChange: jest.fn() }
            ,
            storagePath: '/path/to/storage',
            globalStoragePath: '/path/to/globalStorage',
            logPath: '/path/to/logs',
            extension: { id: 'test', extensionPath: '/path/to/extension' } as any
        } as vscode.ExtensionContext;
        mockFs = {
            existsSync: jest.fn<(path: fs.PathLike) => boolean>(),
            readFileSync: jest.fn<(path: fs.PathOrFileDescriptor, options: BufferEncoding) => string>(),
        };
        mockVscode = {
            workspace: {
                workspaceFolders: [],
            },
            window: {
                showErrorMessage: jest.fn(),
            },
        };
    });

    it('should read the workspace config if it exists', async () => {
        mockVscode.workspace.workspaceFolders = [{
            uri: { fsPath: '/path/to/workspace', toString: () => '/path/to/workspace' } as vscode.Uri,
            name: 'workspace',
            index: 0
        }];
        (mockFs.existsSync as jest.Mock).mockReturnValue(true);
        (mockFs.readFileSync as jest.Mock).mockReturnValue('{}');

        await readConfig(mockContext, mockFs, mockVscode);

        expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/workspace/suggestio.config.json', 'utf8');
    });

    it('should read the global config if the workspace config does not exist', async () => {
        mockVscode.workspace.workspaceFolders = [{
            uri: { fsPath: '/path/to/workspace', toString: () => '/path/to/workspace' } as vscode.Uri,
            name: 'workspace',
            index: 0
        }];
        (mockFs.existsSync as jest.Mock).mockImplementation((path) => path === '/path/to/globalStorage/config.json');
        (mockFs.readFileSync as jest.Mock).mockReturnValue('{}');

        await readConfig(mockContext, mockFs, mockVscode);

        expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/globalStorage/config.json', 'utf8');
    });

    it('should read the default config if no other config exists', async () => {
        mockVscode.workspace.workspaceFolders = [];
        (mockFs.existsSync as jest.Mock).mockReturnValue(false);
        (mockFs.readFileSync as jest.Mock).mockReturnValue('{}');

        await readConfig(mockContext, mockFs, mockVscode);

        expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/extension/config.json', 'utf8');
    });

    it('should return a default config if reading the file fails', async () => {
        mockVscode.workspace.workspaceFolders = [];
        (mockFs.existsSync as jest.Mock).mockReturnValue(true);
        (mockFs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('Failed to read file');
        });

        const config = await readConfig(mockContext, mockFs, mockVscode);

        expect(JSON.parse(config)).toEqual({
            activeProvider: '',
            providers: {},
            anonymizer: { enabled: false, words: [] }
        });
        expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith('Failed to load config.json: Error: Failed to read file');
    });
});
