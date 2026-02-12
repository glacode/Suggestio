import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { provideInlineCompletionItems } from '../../src/completion/completionProvider.js';
import { IPosition, ICancellationToken } from '../../src/types.js';
import { createMockIgnoreManager, createMockProvider, createMockDocument, createDefaultConfig, createMockLogger } from '../testUtils.js';

// Mock DebounceManager
jest.mock('../../src/completion/debounceManager.js', () => ({
    debounce: (callback: () => any, _delay: number) => {
        callback();
    },
    cancelDebounce: () => {}
}));

// Mock IgnoreManager
const mockIgnoreManager = createMockIgnoreManager();

// Mock Provider
const mockProvider = createMockProvider();

// Mock Document
const mockDocument = createMockDocument();

// Mock Position
const mockPosition: IPosition = { line: 0, character: 0 };

// Mock Cancellation Token
const mockCancellationToken: ICancellationToken = {
    isCancellationRequested: false,
};

const mockLogger = createMockLogger();

describe('provideInlineCompletionItems', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockProvider.query.mockResolvedValue({ role: 'assistant', content: ' suggestion ' });
        mockIgnoreManager.shouldIgnore.mockResolvedValue(false);
    });

    it('should return empty list immediately if enableInlineCompletion is false', async () => {
        const config = createDefaultConfig({ enableInlineCompletion: false });

        const result = await provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            mockLogger,
            mockCancellationToken
        );

        expect(result.items).toHaveLength(0);
        expect(mockIgnoreManager.shouldIgnore).not.toHaveBeenCalled();
        expect(mockProvider.query).not.toHaveBeenCalled();
    });

    it('should proceed if enableInlineCompletion is true', async () => {
        const config = createDefaultConfig({ enableInlineCompletion: true });

        const promise = provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            mockLogger,
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
        const config = createDefaultConfig();
        delete config.enableInlineCompletion;

        const promise = provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            mockLogger,
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
