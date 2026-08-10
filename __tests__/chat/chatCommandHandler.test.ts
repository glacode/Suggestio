import { describe, it, expect, jest } from '@jest/globals';
import { ChatCommandHandler } from '../../src/chat/chatCommandHandler.js';
import { AgentCommandHandler } from '../../src/chat/commands/agentCommandHandler.js';
import { HistoryCommandHandler } from '../../src/chat/commands/historyCommandHandler.js';
import { CompletionCommandHandler } from '../../src/chat/commands/completionCommandHandler.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { WEBVIEW_COMMANDS, APP_EVENTS } from '../../src/constants/protocol.js';
import type { IChatAgent, IContextBuilder, IChatWebviewEventBridge, IChatWebviewView } from '../../src/types.js';
import {
    createMockConfigContainer,
    createMockPersistentHistoryManager,
    createMockWebview,
    createMockWebviewView,
    createMockSecretManager,
    createMockHttpClient,
    createMockConfigProvider,
    createMockEventLogger,
    createMockToolUiProvider
} from '../testUtils.js';

describe('ChatCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const chatAgent: IChatAgent = { run: jest.fn<(p: any, s: any) => Promise<void>>().mockResolvedValue(undefined) };
        const chatHistoryManager = createMockPersistentHistoryManager();
        const buildContext: IContextBuilder = { buildContext: jest.fn<() => Promise<string>>().mockResolvedValue('context') };
        const configContainer = createMockConfigContainer({ profiles: {}, activeChatProfile: 'p1' });
        const configProvider = createMockConfigProvider();
        configProvider.getProfiles.mockReturnValue({});
        const secretManager = createMockSecretManager();
        const httpClient = createMockHttpClient();
        
        const eventBridge: IChatWebviewEventBridge = {
            setView: jest.fn(),
            setAbortControllerAccessor: jest.fn(),
            getActiveDiff: jest.fn<(id: string) => any>(),
            deleteActiveDiff: jest.fn(),
            sendNotification: jest.fn(),
            sendCompletionMessage: jest.fn()
        };
        const view: IChatWebviewView = {
            updateState: jest.fn<() => Promise<void>>(),
            pushUpdate: jest.fn<() => Promise<void>>()
        };

        const logger = createMockEventLogger();
        let abortController: AbortController | undefined;
        const agentHandler = new AgentCommandHandler({
            chatAgent,
            chatHistoryManager,
            buildContext,
            configContainer,
            eventBridge,
            eventBus,
            secretManager,
            httpClient,
            setAbortController: (ac) => { abortController = ac; },
            getAbortController: () => abortController,
            logger
        });

        const historyHandler = new HistoryCommandHandler({
            chatHistoryManager,
            toolUiProvider: createMockToolUiProvider()
        });

        const completionHandler = new CompletionCommandHandler({
            configProvider,
            eventBus
        });

        const handler = new ChatCommandHandler({
            handlers: [agentHandler, historyHandler, completionHandler],
            eventBus,
            getAbortController: () => abortController
        });
        handler.setView(view);

        return { handler, chatAgent, chatHistoryManager, buildContext, eventBus, view, eventBridge, configProvider };
    };

    it('handles SEND_MESSAGE and triggers agent run', async () => {
        const { handler, chatAgent, chatHistoryManager, buildContext } = createDependencies();
        const posted: any[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);

        await handler.handleMessage({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' }, webviewView);

        expect(chatHistoryManager.addMessage).toHaveBeenCalledWith({ role: 'user', content: 'hello' });
        expect(buildContext.buildContext).toHaveBeenCalled();
        expect(chatAgent.run).toHaveBeenCalled();
    });

    it('handles CANCEL_REQUEST and aborts current run', async () => {
        const { handler } = createDependencies();
        const posted: any[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);

        // First trigger a run to set the abort controller
        const runPromise = handler.handleMessage({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text: 'hello' }, webviewView);
        
        await handler.handleMessage({ command: WEBVIEW_COMMANDS.CANCEL_REQUEST }, webviewView);
        
        expect(handler.getAbortController()?.signal.aborted).toBe(true);
        await runPromise;
    });

    it('handles CLEAR_HISTORY', async () => {
        const { handler, chatHistoryManager } = createDependencies();
        const webview = createMockWebview([]);
        const webviewView = createMockWebviewView(webview);

        await handler.handleMessage({ command: WEBVIEW_COMMANDS.CLEAR_HISTORY }, webviewView);

        expect(chatHistoryManager.clearHistory).toHaveBeenCalled();
    });

    it('handles COMPLETION_PROFILE_CHANGED', async () => {
        const { handler, configProvider, eventBus } = createDependencies();
        const webview = createMockWebview([]);
        const webviewView = createMockWebviewView(webview);

        const emittedEvents: any[] = [];
        eventBus.on(APP_EVENTS.COMPLETION_PROFILE_CHANGED, (model: string) => {
            emittedEvents.push({ event: APP_EVENTS.COMPLETION_PROFILE_CHANGED, model });
        });

        await handler.handleMessage({ 
            command: WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED,
            model: 'test-completion-profile'
        }, webviewView);

        expect(emittedEvents).toEqual([
            { event: APP_EVENTS.COMPLETION_PROFILE_CHANGED, model: 'test-completion-profile' }
        ]);
        
        expect(configProvider.updateConfig).toHaveBeenCalledWith(
            'activeCompletionProfile',
            'test-completion-profile',
            true
        );
    });
});
