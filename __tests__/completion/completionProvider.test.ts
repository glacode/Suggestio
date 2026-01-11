import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { provideInlineCompletionItems } from '../../src/completion/completionProvider.js';
import { Config } from '../../src/config/types.js';
import { llmProvider } from '../../src/providers/llmProvider.js';
import { IgnoreManager } from '../../src/chat/ignoreManager.js';
import * as vscode from 'vscode';

// Mock DebounceManager
jest.mock('../../src/completion/debounceManager.js', () => ({
    debounce: (callback: () => any, _delay: number) => {
        callback();
    },
    cancelDebounce: () => {}
}));

// Mock IgnoreManager
const mockIgnoreManager = {
    shouldIgnore: jest.fn<IgnoreManager['shouldIgnore']>().mockResolvedValue(false),
} as unknown as IgnoreManager;

// Mock Provider
const mockProvider = {
    query: jest.fn(),
} as unknown as llmProvider;

// Mock Document
const mockDocument = {
    uri: { fsPath: '/path/to/file.ts' },
    getText: () => 'content',
    lineAt: () => ({ text: 'content' }),
    offsetAt: () => 0,
    positionAt: () => new vscode.Position(0, 0),
    fileName: '/path/to/file.ts'
} as unknown as vscode.TextDocument;

// Mock Position
const mockPosition = new vscode.Position(0, 0);

describe('provideInlineCompletionItems', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (mockProvider as any).query.mockResolvedValue(' suggestion ');
        (mockIgnoreManager as any).shouldIgnore.mockResolvedValue(false);
    });

    it('should return empty list immediately if enableInlineCompletion is false', async () => {
        const config: Config = {
            activeProvider: 'test',
            enableInlineCompletion: false,
            providers: {},
            anonymizer: { enabled: false, words: [] }
        };

        const result = await provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            {} as any
        );

        expect(result.items).toHaveLength(0);
        expect(mockIgnoreManager.shouldIgnore).not.toHaveBeenCalled();
        expect(mockProvider.query).not.toHaveBeenCalled();
    });

    it('should proceed if enableInlineCompletion is true', async () => {
        const config: Config = {
            activeProvider: 'test',
            enableInlineCompletion: true,
            providers: {},
            anonymizer: { enabled: false, words: [] }
        };

        const promise = provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            {} as any
        );
        
        // Wait for async operations
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const result = await promise;

        expect(mockIgnoreManager.shouldIgnore).toHaveBeenCalled();
        expect(mockProvider.query).toHaveBeenCalled();
        expect(result.items).toHaveLength(1);
        expect(result.items[0].insertText).toBe(' suggestion ');
    });

    it('should proceed if enableInlineCompletion is undefined (default true)', async () => {
        const config: Config = {
            activeProvider: 'test',
            providers: {},
            anonymizer: { enabled: false, words: [] }
        };

        const promise = provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            {} as any
        );
        
        // Wait for async operations
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const result = await promise;

        expect(mockIgnoreManager.shouldIgnore).toHaveBeenCalled();
        expect(mockProvider.query).toHaveBeenCalled();
        expect(result.items).toHaveLength(1);
    });
});
