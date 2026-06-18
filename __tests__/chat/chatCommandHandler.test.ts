import { describe, it, expect, jest } from '@jest/globals';
import { ChatCommandHandler } from '../../src/chat/chatCommandHandler.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';
import type { IChatAgent, IContextBuilder, IChatWebviewEventBridge, IChatWebviewView } from '../../src/types.js';
import {
    createMockConfigContainer,
    createMockPersistentHistoryManager,
    createMockVscodeApi,
    createMockWebview,
    createMockWebviewView,
    createMockDiffManager,
    createMockSecretManager,
    createMockHttpClient,
    createMockToolUiProvider,
    createMockConfigProvider
} from '../testUtils.js';

describe('ChatCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const chatAgent: IChatAgent = { run: jest.fn<(p: any, s: any) => Promise<void>>().mockResolvedValue(undefined) };
        const chatHistoryManager = createMockPersistentHistoryManager();
        const buildContext: IContextBuilder = { buildContext: jest.fn<() => Promise<string>>().mockResolvedValue('context') };
        const diffManager = createMockDiffManager();
        const configContainer = createMockConfigContainer({ profiles: {}, activeChatProfile: 'p1' });
        const configProvider = createMockConfigProvider();
        configProvider.getProfiles.mockReturnValue({});
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
        const vscodeApi = createMockVscodeApi();
        const view: IChatWebviewView = {
            updateState: jest.fn<() => Promise<void>>(),
            pushUpdate: jest.fn<() => Promise<void>>()
        };

        const handler = new ChatCommandHandler(
            chatAgent,
            chatHistoryManager,
            buildContext,
            eventBus,
            diffManager,
            configContainer,
            configProvider,
            secretManager,
            httpClient,
            toolUiProvider,
            eventBridge,
            vscodeApi
        );
        handler.setView(view);

        return { handler, chatAgent, chatHistoryManager, buildContext, eventBus, view, eventBridge };
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
});
