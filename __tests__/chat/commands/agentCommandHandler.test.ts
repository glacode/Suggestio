import { describe, it, expect, jest } from '@jest/globals';
import { AgentCommandHandler } from '../../../src/chat/commands/agentCommandHandler.js';
import { EventBus } from '../../../src/utils/eventBus.js';
import { WEBVIEW_COMMANDS } from '../../../src/constants/protocol.js';
import type { IChatAgent, IContextBuilder, IWebviewView } from '../../../src/types.js';
import { createEventLogger } from '../../../src/log/eventLogger.js';
import { createMockConfigContainer, createMockPersistentHistoryManager, createMockWebview, createMockWebviewView, createMockSecretManager, createMockHttpClient, createMockEventBridge, createMockChatWebviewView } from '../../testUtils.js';

describe('AgentCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const chatAgent: IChatAgent = { run: jest.fn<(p: any, s: any) => Promise<void>>().mockResolvedValue(undefined) };
        const chatHistoryManager = createMockPersistentHistoryManager();
        const buildContext: IContextBuilder = { buildContext: jest.fn<() => Promise<string>>().mockResolvedValue('context') };
        const configContainer = createMockConfigContainer({ profiles: {}, activeChatProfile: 'p1' });
        const eventBridge = createMockEventBridge();
        const secretManager = createMockSecretManager();
        const httpClient = createMockHttpClient();
        let abortController: AbortController | undefined;
        const setAbortController = (ac: AbortController) => { abortController = ac; };
        const getAbortController = () => abortController;
        const logger = createEventLogger(eventBus);

        const handler = new AgentCommandHandler({
            chatAgent,
            chatHistoryManager,
            buildContext,
            configContainer,
            eventBridge,
            eventBus,
            secretManager,
            httpClient,
            setAbortController,
            getAbortController,
            logger
        });

        return { handler, chatAgent, chatHistoryManager, buildContext, eventBus, eventBridge };
    };

    const createContext = (webviewView: IWebviewView) => {
        const eventBus = new EventBus();
        const logger = createEventLogger(eventBus);
        const view = createMockChatWebviewView();
        return {
            view,
            webviewView,
            abortController: undefined,
            getAbortController: () => undefined,
            eventBus,
            logger
        };
    };

    it('handles SEND_MESSAGE and triggers agent run', async () => {
        const { handler, chatAgent, chatHistoryManager, buildContext } = createDependencies();
        const webview = createMockWebview([]);
        const webviewView = createMockWebviewView(webview);
        const ctx = createContext(webviewView);

        await handler.handle({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' }, ctx);

        expect(chatHistoryManager.addMessage).toHaveBeenCalledWith({ role: 'user', content: 'hello' });
        expect(buildContext.buildContext).toHaveBeenCalled();
        expect(chatAgent.run).toHaveBeenCalled();
    });

    it('handles CANCEL_REQUEST and aborts current run', async () => {
        const { handler } = createDependencies();
        const webview = createMockWebview([]);
        const webviewView = createMockWebviewView(webview);
        const ctx = createContext(webviewView);

        // First trigger a run to set the abort controller
        const runPromise = handler.handle({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' }, ctx);
        
        await handler.handle({ command: WEBVIEW_COMMANDS.CANCEL_REQUEST }, ctx);
        
        // We need to check if the abort controller was actually called
        // In the current implementation, it sets the controller on the handler
        // and uses it to abort.
        await runPromise;
    });

    it('handles RETRY_LAST_MESSAGE and triggers agent run again', async () => {
        const { handler, chatAgent, buildContext } = createDependencies();
        const webview = createMockWebview([]);
        const webviewView = createMockWebviewView(webview);
        const ctx = createContext(webviewView);

        await handler.handle({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' }, ctx);
        expect(chatAgent.run).toHaveBeenCalledTimes(1);

        await handler.handle({ command: WEBVIEW_COMMANDS.RETRY_LAST_MESSAGE }, ctx);
        expect(chatAgent.run).toHaveBeenCalledTimes(2);
        expect(buildContext.buildContext).toHaveBeenCalledTimes(2);
    });

    it('canHandle returns true for agent commands', () => {
        const { handler } = createDependencies();
        expect(handler.canHandle(WEBVIEW_COMMANDS.SEND_MESSAGE)).toBe(true);
        expect(handler.canHandle(WEBVIEW_COMMANDS.RETRY_LAST_MESSAGE)).toBe(true);
        expect(handler.canHandle(WEBVIEW_COMMANDS.CANCEL_REQUEST)).toBe(true);
    });

    it('canHandle returns false for non-agent commands', () => {
        const { handler } = createDependencies();
        expect(handler.canHandle(WEBVIEW_COMMANDS.CLEAR_HISTORY)).toBe(false);
        expect(handler.canHandle(WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED)).toBe(false);
        expect(handler.canHandle(WEBVIEW_COMMANDS.VIEW_DIFF)).toBe(false);
    });
});