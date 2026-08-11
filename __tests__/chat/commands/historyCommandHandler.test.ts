import { describe, it, expect, jest } from '@jest/globals';
import { HistoryCommandHandler } from '../../../src/chat/commands/historyCommandHandler.js';
import { EventBus } from '../../../src/utils/eventBus.js';
import { WEBVIEW_COMMANDS } from '../../../src/constants/protocol.js';
import { createMockPersistentHistoryManager, createMockToolUiProvider, createMockWebviewView, createMockWebview, createMockEventLogger } from '../../testUtils.js';
import { ICommandContext } from '../../../src/chat/chatCommandHandler.js';
import { IChatWebviewView } from '../../../src/types.js';

describe('HistoryCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const chatHistoryManager = createMockPersistentHistoryManager();
        const toolUiProvider = createMockToolUiProvider();
        const posted: any[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);
        const view: IChatWebviewView = {
            updateState: jest.fn<() => Promise<void>>(),
            pushUpdate: jest.fn<() => Promise<void>>()
        };

        const handler = new HistoryCommandHandler({
            chatHistoryManager,
            toolUiProvider
        });

        return { handler, chatHistoryManager, toolUiProvider, webviewView, webview, eventBus, view };
    };

    const createMockContext = (webviewView: any, view: IChatWebviewView): ICommandContext => ({
        view,
        webviewView,
        eventBus: new EventBus(),
        logger: createMockEventLogger()
    });

    describe('canHandle', () => {
        it('should return true for history-related commands', () => {
            const { handler } = createDependencies();
            
            expect(handler.canHandle(WEBVIEW_COMMANDS.CLEAR_HISTORY)).toBe(true);
            expect(handler.canHandle(WEBVIEW_COMMANDS.GET_SESSIONS)).toBe(true);
            expect(handler.canHandle(WEBVIEW_COMMANDS.LOAD_SESSION)).toBe(true);
        });

        it('should return false for non-history commands', () => {
            const { handler } = createDependencies();
            
            expect(handler.canHandle('unknownCommand')).toBe(false);
            expect(handler.canHandle(WEBVIEW_COMMANDS.SEND_MESSAGE)).toBe(false);
            expect(handler.canHandle(WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED)).toBe(false);
        });
    });

    describe('CLEAR_HISTORY', () => {
        it('should clear chat history', async () => {
            const { handler, chatHistoryManager, webviewView, view } = createDependencies();
            
            const ctx = createMockContext(webviewView, view);
            await handler.handle({
                command: WEBVIEW_COMMANDS.CLEAR_HISTORY
            }, ctx);

            expect(chatHistoryManager.clearHistory).toHaveBeenCalled();
        });
    });

    describe('GET_SESSIONS', () => {
        it('should get sessions and send formatted session list', async () => {
            const { handler, chatHistoryManager, webviewView, webview, view } = createDependencies();
            
            const mockSessions = [
                {
                    id: 'session-1',
                    title: 'Test Session 1',
                    timestamp: Date.now(),
                    history: [
                        { role: 'user' as const, content: 'Hello world' },
                        { role: 'assistant' as const, content: 'Hi there' }
                    ]
                },
                {
                    id: 'session-2',
                    title: 'Test Session 2',
                    timestamp: Date.now(),
                    history: [
                        { role: 'assistant' as const, content: 'How can I help?' }
                    ]
                }
            ];
            
            chatHistoryManager.getSessions.mockResolvedValue(mockSessions);
            const postMessageSpy = jest.spyOn(webview, 'postMessage');
            
            const ctx = createMockContext(webviewView, view);
            await handler.handle({
                command: WEBVIEW_COMMANDS.GET_SESSIONS
            }, ctx);

            expect(chatHistoryManager.getSessions).toHaveBeenCalled();
            expect(postMessageSpy).toHaveBeenCalledWith({
                type: 'sessionsList',
                sessions: [
                    {
                        id: 'session-1',
                        title: 'Test Session 1',
                        timestamp: mockSessions[0].timestamp,
                        fullPrompt: 'Hello world'
                    },
                    {
                        id: 'session-2',
                        title: 'Test Session 2',
                        timestamp: mockSessions[1].timestamp,
                        fullPrompt: undefined
                    }
                ]
            });
            
            postMessageSpy.mockRestore();
        });
    });

    describe('LOAD_SESSION', () => {
        it('should load session and send enriched chat history', async () => {
            const { handler, chatHistoryManager, toolUiProvider, webviewView, webview, view } = createDependencies();
            
            const mockHistory = [
                { role: 'user' as const, content: 'Test message' },
                { role: 'assistant' as const, content: 'Test response' }
            ];
            
            const enrichedHistory = [
                { role: 'user' as const, content: 'Test message', displayMessage: 'formatted-message', uiOptions: {} },
                { role: 'assistant' as const, content: 'Test response', displayMessage: 'formatted-message', uiOptions: {} }
            ];
            
            chatHistoryManager.getChatHistory.mockReturnValue(mockHistory);
            toolUiProvider.enrichHistory.mockReturnValue(enrichedHistory);
            const postMessageSpy = jest.spyOn(webview, 'postMessage');
            
            const ctx = createMockContext(webviewView, view);
            await handler.handle({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'test-session'
            }, ctx);

            expect(chatHistoryManager.loadSession).toHaveBeenCalledWith('test-session');
            expect(toolUiProvider.enrichHistory).toHaveBeenCalledWith(mockHistory);
            expect(postMessageSpy).toHaveBeenCalledWith({
                type: 'chatHistoryLoaded',
                history: enrichedHistory
            });
            
            postMessageSpy.mockRestore();
        });
    });
});
