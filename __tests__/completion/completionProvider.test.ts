import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { provideInlineCompletionItems } from '../../src/completion/completionProvider.js';
import { IIgnoreManager, ITextDocument, IPosition, Config, ILlmProvider, ICancellationToken, ChatMessage } from '../../src/types.js';

// Mock DebounceManager
jest.mock('../../src/completion/debounceManager.js', () => ({
    debounce: (callback: () => any, _delay: number) => {
        callback();
    },
    cancelDebounce: () => {}
}));

// Mock IgnoreManager
const mockIgnoreManager: jest.Mocked<IIgnoreManager> = {
    shouldIgnore: jest.fn<(filePath: string) => Promise<boolean>>().mockResolvedValue(false),
};

// Mock Provider
const mockProvider: jest.Mocked<ILlmProvider> = {
    query: jest.fn<(prompt: any, tools?: any, signal?: any) => Promise<ChatMessage | null>>(),
    queryStream: jest.fn<(prompt: any, onToken: any, tools?: any, signal?: any) => Promise<ChatMessage | null>>(),
};

// Mock Document
const mockDocument: ITextDocument = {
    uri: { fsPath: '/path/to/file.ts', toString: () => '/path/to/file.ts' },
    languageId: 'typescript',
    lineCount: 1,
    lineAt: () => ({ text: 'content' }),
};

// Mock Position
const mockPosition: IPosition = { line: 0, character: 0 };

// Mock Cancellation Token
const mockCancellationToken: ICancellationToken = {
    isCancellationRequested: false,
};

describe('provideInlineCompletionItems', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockProvider.query.mockResolvedValue({ role: 'assistant', content: ' suggestion ' });
        mockIgnoreManager.shouldIgnore.mockResolvedValue(false);
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
            mockCancellationToken
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
            mockCancellationToken
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
            mockCancellationToken
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
