import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { provideInlineCompletionItems } from '../../src/completion/completionProvider.js';
import { IIgnoreManager, ITextDocument, IPosition, Config, llmProvider } from '../../src/types.js';

// Mock DebounceManager
jest.mock('../../src/completion/debounceManager.js', () => ({
    debounce: (callback: () => any, _delay: number) => {
        callback();
    },
    cancelDebounce: () => {}
}));

// Mock IgnoreManager
const mockIgnoreManager = {
    shouldIgnore: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
} as unknown as IIgnoreManager;

// Mock Provider
const mockProvider = {
    query: jest.fn(),
} as unknown as llmProvider;

// Mock Document
const mockDocument = {
    uri: { fsPath: '/path/to/file.ts', toString: () => '/path/to/file.ts' },
    languageId: 'typescript',
    lineCount: 1,
    lineAt: () => ({ text: 'content' }),
} as unknown as ITextDocument;

// Mock Position
const mockPosition: IPosition = { line: 0, character: 0 };

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
        } as any;

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
        } as any;

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
        } as any;

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
