import { describe, it, expect } from '@jest/globals';
import { createChatCommandHandler } from '../../src/chat/chatCommandHandlers.js';
import { EventBus } from '../../src/utils/eventBus.js';

import {
    createMockConfigContainer,
    createMockPersistentHistoryManager,
    createMockSecretManager,
    createMockHttpClient,
    createMockConfigProvider,
    createMockToolUiProvider,
    createMockDiffManager,
    createMockVscodeApi,
    createMockEventBridge,
    createMockChatAgent,
    createMockPromptContextBuilder
} from '../testUtils.js';

describe('createChatCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const chatAgent = createMockChatAgent();
        const chatHistoryManager = createMockPersistentHistoryManager();
        const buildContext = createMockPromptContextBuilder();
        const configContainer = createMockConfigContainer({ profiles: {}, activeChatProfile: 'p1' });
        const configProvider = createMockConfigProvider();
        const secretManager = createMockSecretManager();
        const httpClient = createMockHttpClient();
        const toolUiProvider = createMockToolUiProvider();
        const eventBridge = createMockEventBridge();

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
        const handler = createChatCommandHandler(createDependencies());
        expect(handler).toBeDefined();
    });
});
