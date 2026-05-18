import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { provideInlineCompletionItems } from '../../src/completion/completionProvider.js';
import { IPosition, ICancellationToken } from '../../src/types.js';
import { createMockIgnoreManager, createMockProvider, createMockDocument, createDefaultConfig } from '../testUtils.js';
import { EventBus } from '../../src/utils/eventBus.js';

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

const eventBus = new EventBus();

describe('provideInlineCompletionItems', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockProvider.query.mockResolvedValue({ role: 'assistant', content: ' suggestion ' });
        mockIgnoreManager.shouldIgnore.mockResolvedValue(false);
    });

    it('should return empty list immediately if inline completion is disabled', async () => {
        const config = createDefaultConfig({ inlineCompletion: { enabled: false, supportedLanguages: ['typescript'], enableInUntitledEditors: false } });

        const result = await provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            eventBus,
            {},
            mockCancellationToken
        );

        expect(result.items).toHaveLength(0);
        expect(mockIgnoreManager.shouldIgnore).not.toHaveBeenCalled();
        expect(mockProvider.query).not.toHaveBeenCalled();
    });

    it('should return empty list if the language is not supported', async () => {
        const config = createDefaultConfig({ inlineCompletion: { enabled: true, supportedLanguages: ['python'], enableInUntitledEditors: false } });
        mockDocument.languageId = 'typescript';

        const result = await provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            eventBus,
            {},
            mockCancellationToken
        );

        expect(result.items).toHaveLength(0);
        expect(mockProvider.query).not.toHaveBeenCalled();
    });

    it('should proceed if inline completion is enabled and language is supported', async () => {
        const config = createDefaultConfig({ inlineCompletion: { enabled: true, supportedLanguages: ['typescript'], enableInUntitledEditors: true } });
        mockDocument.languageId = 'typescript';
        mockDocument.uri.scheme = 'file';

        const result = await provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            eventBus,
            {},
            mockCancellationToken
        );

        expect(mockIgnoreManager.shouldIgnore).toHaveBeenCalled();
        expect(mockProvider.query).toHaveBeenCalled();
        expect(result.items).toHaveLength(1);
        expect(result.items[0].insertText).toBe(' suggestion ');
    });

    it('should proceed if inline completion is enabled (default)', async () => {
        const config = createDefaultConfig();
        mockDocument.languageId = 'typescript'; // Included in default supportedLanguages
        mockDocument.uri.scheme = 'file';

        const result = await provideInlineCompletionItems(
            mockProvider,
            config,
            mockIgnoreManager,
            mockDocument,
            mockPosition,
            eventBus,
            {},
            mockCancellationToken
        );

        expect(mockIgnoreManager.shouldIgnore).toHaveBeenCalled();
        expect(mockProvider.query).toHaveBeenCalled();
        expect(result.items).toHaveLength(1);
    });
});
