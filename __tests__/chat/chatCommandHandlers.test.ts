import { describe, it, expect, jest } from '@jest/globals';
import { createChatCommandHandler } from '../../src/chat/chatCommandHandlers.js';
import { EventBus } from '../../src/utils/eventBus.js';
import type { IChatAgent, IContextBuilder, IChatWebviewEventBridge } from '../../src/types.js';
import {
    createMockConfigContainer,
    createMockPersistentHistoryManager,
    createMockSecretManager,
    createMockHttpClient,
    createMockConfigProvider,
    createMockToolUiProvider,
    createMockDiffManager,
    createMockVscodeApi
} from '../testUtils.js';

describe('createChatCommandHandler', () => {
    const buildDeps = () => {
        const eventBus = new EventBus();
        const chatAgent: IChatAgent = {
            run: jest.fn<(p: any, s: any) => Promise<void>>().mockResolvedValue(undefined)
        };
        const chatHistoryManager = createMockPersistentHistoryManager();
        const buildContext: IContextBuilder = {
            buildContext: jest.fn<() => Promise<string>>().mockResolvedValue('context')
        };
        const configContainer = createMockConfigContainer({ profiles: {}, activeChatProfile: 'p1' });
        const configProvider = createMockConfigProvider();
        const secretManager = createMockSecretManager();
        const httpClient = createMockHttpClient();
        const toolUiProvider = createMockToolUiProvider();
        const eventBridge: IChatWebviewEventBridge = {
            setView: jest.fn(),
            setAbortControllerAccessor: jest.fn(),
            getActiveDiff: jest.fn<(id: string) => any>(),
            deleteActiveDiff: jest.fn(),
            sendNotification: jest.fn(),
            sendCompletionMessage: jest.fn()
        };

        return {
            chatAgent,
            chatHistoryManager,
            buildContext,
            eventBus,
            diffManager: createMockDiffManager(),
            configContainer,
            configProvider,
            secretManager,
            httpClient,
            toolUiProvider,
            eventBridge,
            vscodeApi: createMockVscodeApi()
        };
    };

    it('returns a ChatCommandHandler for a valid dependency set', () => {
        // The composition root's coverage guarantee is: given a complete
        // dependency set, the resulting dispatcher has a handler for every
        // command in the protocol. If the guarantee is broken, this call
        // throws and the test fails.
        const handler = createChatCommandHandler(buildDeps());
        expect(handler).toBeDefined();
    });
});
