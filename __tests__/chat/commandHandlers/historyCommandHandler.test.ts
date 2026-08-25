import { describe, it, expect, jest } from '@jest/globals';
import { HistoryCommandHandler } from '../../../src/chat/commandHandlers/historyCommandHandler.js';
import { EventBus } from '../../../src/utils/eventBus.js';
import { WEBVIEW_COMMANDS } from '../../../src/constants/protocol.js';
import { createMockPersistentHistoryManager, createMockToolUiProvider, createMockWebviewView, createMockWebview, createMockChatWebviewView, createMockCommandContext } from '../../testUtils.js';
import { IStoredChatMessage, ToolCall } from '../../../src/types.js';

describe('HistoryCommandHandler', () => {
    const createDependencies = () => {
        const eventBus = new EventBus();
        const chatHistoryManager = createMockPersistentHistoryManager();
        const toolUiProvider = createMockToolUiProvider();
        const posted: any[] = [];
        const webview = createMockWebview(posted);
        const webviewView = createMockWebviewView(webview);
        const view = createMockChatWebviewView();

        const handler = new HistoryCommandHandler({
            chatHistoryManager,
            toolUiProvider
        });

        return { handler, chatHistoryManager, toolUiProvider, webviewView, webview, eventBus, view };
    };

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
            
            const ctx = createMockCommandContext({ view, webviewView });
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
            
            const ctx = createMockCommandContext({ view, webviewView });
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
            
            const ctx = createMockCommandContext({ view, webviewView });
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

        it('should clean malformed tool calls (null entries, invalid JSON arguments, undefined arguments)', async () => {
            const { handler, chatHistoryManager, toolUiProvider, webviewView, webview, view } = createDependencies();
            
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const undefinedArgumentsValue = undefined;
            const nullToolCall = null;
            const mockHistory: IStoredChatMessage[] = [
                {
                    role: 'assistant',
                    content: 'Calling tools',
                    tool_calls: [
                        nullToolCall!,
                        {
                            id: 'call-1',
                            type: 'function',
                            function: { name: 'testTool', arguments: 'invalid-json' }
                        },
                        {
                            id: 'call-2',
                            type: 'function',
                            function: { name: 'testTool2', arguments: undefinedArgumentsValue! }
                        },
                        {
                            id: 'call-3',
                            type: 'function',
                            function: { name: 'testTool3', arguments: '{"valid": true}' }
                        }
                    ]
                },
                {
                    role: 'user',
                    content: 'Regular message'
                }
            ];

            chatHistoryManager.getChatHistory.mockReturnValue(mockHistory);
            toolUiProvider.enrichHistory.mockImplementation((hist) => hist);
            const postMessageSpy = jest.spyOn(webview, 'postMessage');

            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'test-session'
            }, ctx);

            expect(toolUiProvider.enrichHistory).toHaveBeenCalledWith([
                {
                    role: 'assistant',
                    content: 'Calling tools',
                    tool_calls: [
                        {
                            id: 'call-1',
                            type: 'function',
                            function: { name: 'testTool', arguments: '{}' }
                        },
                        {
                            id: 'call-2',
                            type: 'function',
                            function: { name: 'testTool2', arguments: '{}' }
                        },
                        {
                            id: 'call-3',
                            type: 'function',
                            function: { name: 'testTool3', arguments: '{"valid": true}' }
                        }
                    ]
                },
                {
                    role: 'user',
                    content: 'Regular message'
                }
            ]);

            consoleWarnSpy.mockRestore();
            postMessageSpy.mockRestore();
        });

        it('should default arguments to an empty JSON string when the arguments key is present but its value is undefined', async () => {
            // Behavioral contract: a stored tool call whose `arguments` property
            // exists but has no value must be repaired to a valid empty JSON
            // object before the history is handed off to the UI provider.
            const { handler, chatHistoryManager, toolUiProvider, webviewView, webview, view } = createDependencies();

            // Build a well-typed ToolCall, then mutate the runtime value of
            // `arguments` to undefined. The property still exists, so
            // `'arguments' in call.function` evaluates true, but its value is
            // undefined, taking the recovery branch.
            const toolCall: ToolCall = {
                id: 'call-undefined-args',
                type: 'function',
                function: { name: 'testTool', arguments: '{}' }
            };
            Object.defineProperty(toolCall.function, 'arguments', {
                value: undefined,
                writable: true,
                enumerable: true,
                configurable: true
            });

            const mockHistory: IStoredChatMessage[] = [
                {
                    role: 'assistant',
                    content: 'Calling tool with missing arguments value',
                    tool_calls: [toolCall]
                }
            ];

            chatHistoryManager.getChatHistory.mockReturnValue(mockHistory);
            toolUiProvider.enrichHistory.mockImplementation((hist) => hist);
            const postMessageSpy = jest.spyOn(webview, 'postMessage');

            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'test-session'
            }, ctx);

            expect(toolUiProvider.enrichHistory).toHaveBeenCalledWith([
                {
                    role: 'assistant',
                    content: 'Calling tool with missing arguments value',
                    tool_calls: [
                        {
                            id: 'call-undefined-args',
                            type: 'function',
                            function: { name: 'testTool', arguments: '{}' }
                        }
                    ]
                }
            ]);

            postMessageSpy.mockRestore();
        });

        it('should leave arguments untouched when arguments is neither a string nor undefined', async () => {
            // Behavioral contract: when the stored value of `arguments` is
            // some other non-string value (null here), the loader does not
            // attempt to coerce or replace it; it is forwarded as-is.
            const { handler, chatHistoryManager, toolUiProvider, webviewView, webview, view } = createDependencies();

            const toolCall: ToolCall = {
                id: 'call-null-args',
                type: 'function',
                function: { name: 'testTool', arguments: '{}' }
            };
            Object.defineProperty(toolCall.function, 'arguments', {
                value: null,
                writable: true,
                enumerable: true,
                configurable: true
            });

            const mockHistory: IStoredChatMessage[] = [
                {
                    role: 'assistant',
                    content: 'Calling tool with non-string arguments',
                    tool_calls: [toolCall]
                }
            ];

            chatHistoryManager.getChatHistory.mockReturnValue(mockHistory);
            toolUiProvider.enrichHistory.mockImplementation((hist) => hist);
            const postMessageSpy = jest.spyOn(webview, 'postMessage');

            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'test-session'
            }, ctx);

            // Use partial matchers because the runtime value of `arguments` is
            // null, which does not match the declared `string` type.
            expect(toolUiProvider.enrichHistory).toHaveBeenCalledWith([
                expect.objectContaining({
                    role: 'assistant',
                    content: 'Calling tool with non-string arguments',
                    tool_calls: expect.arrayContaining([
                        expect.objectContaining({
                            id: 'call-null-args',
                            type: 'function',
                            function: expect.objectContaining({
                                name: 'testTool',
                                arguments: null
                            })
                        })
                    ])
                })
            ]);

            postMessageSpy.mockRestore();
        });

        it('should leave a tool call untouched when its function has no arguments property', async () => {
            // Behavioral contract: a tool call whose `function` object lacks the
            // `arguments` key entirely is returned as-is by the cleaner, without
            // any validation attempt.
            const { handler, chatHistoryManager, toolUiProvider, webviewView, webview, view } = createDependencies();

            // `JSON.parse` returns `any`, which assigns cleanly to a `ToolCall`
            // typed variable without any assertion. The resulting object is
            // missing the `arguments` key, so the runtime check
            // `'arguments' in call.function` is false.
            const toolCall: ToolCall = JSON.parse(
                '{"id":"call-no-args","type":"function","function":{"name":"testTool"}}'
            );

            const mockHistory: IStoredChatMessage[] = [
                {
                    role: 'assistant',
                    content: 'Calling tool without arguments property',
                    tool_calls: [toolCall]
                }
            ];

            chatHistoryManager.getChatHistory.mockReturnValue(mockHistory);
            toolUiProvider.enrichHistory.mockImplementation((hist) => hist);
            const postMessageSpy = jest.spyOn(webview, 'postMessage');

            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'test-session'
            }, ctx);

            // The cleaner must pass the call through without adding the
            // `arguments` key. Verify the absence of the key at runtime.
            const callArg = toolUiProvider.enrichHistory.mock.calls[0]?.[0];
            const firstToolCall = callArg?.[0]?.tool_calls?.[0];
            expect(firstToolCall).toBeDefined();
            expect('arguments' in (firstToolCall?.function ?? {})).toBe(false);

            postMessageSpy.mockRestore();
        });

        it('should handle errors when loading session fails', async () => {
            const { handler, chatHistoryManager, webviewView, webview, view } = createDependencies();
            
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            chatHistoryManager.loadSession.mockRejectedValue(new Error('Storage failure'));
            const postMessageSpy = jest.spyOn(webview, 'postMessage');

            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'bad-session'
            }, ctx);

            expect(postMessageSpy).toHaveBeenCalledWith({
                sender: 'assistant',
                type: 'error',
                text: 'Failed to load session: Storage failure'
            });

            consoleErrorSpy.mockRestore();
            postMessageSpy.mockRestore();
        });

        it('should handle non-Error objects when loading session fails', async () => {
            const { handler, chatHistoryManager, webviewView, webview, view } = createDependencies();
            
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            chatHistoryManager.loadSession.mockRejectedValue('String error');
            const postMessageSpy = jest.spyOn(webview, 'postMessage');

            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'bad-session'
            }, ctx);

            expect(postMessageSpy).toHaveBeenCalledWith({
                sender: 'assistant',
                type: 'error',
                text: 'Failed to load session: String error'
            });

            consoleErrorSpy.mockRestore();
            postMessageSpy.mockRestore();
        });
    });

    describe('DELETE_SESSION', () => {
        it('should handle DELETE_SESSION command', async () => {
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
            
            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.DELETE_SESSION,
                sessionId: 'session-1'
            }, ctx);

            expect(chatHistoryManager.deleteSession).toHaveBeenCalledWith('session-1');
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

        it('should return true for DELETE_SESSION in canHandle', () => {
            const { handler } = createDependencies();

            expect(handler.canHandle(WEBVIEW_COMMANDS.DELETE_SESSION)).toBe(true);
        });
    });

    describe('handle with non-history command', () => {
        it('should ignore any command that is not a history command', async () => {
            // Behavioral contract: when `handle` is invoked with a valid
            // WebviewMessage whose command is not one of the history commands,
            // the handler must do nothing — it must not call any chat-history
            // method, must not invoke the UI provider, and must not post any
            // message to the webview.
            const { handler, chatHistoryManager, toolUiProvider, webviewView, webview, view } = createDependencies();
            const postMessageSpy = jest.spyOn(webview, 'postMessage');

            const ctx = createMockCommandContext({ view, webviewView });
            await handler.handle({
                command: WEBVIEW_COMMANDS.SEND_MESSAGE,
                text: 'hello'
            }, ctx);

            expect(chatHistoryManager.clearHistory).not.toHaveBeenCalled();
            expect(chatHistoryManager.getSessions).not.toHaveBeenCalled();
            expect(chatHistoryManager.loadSession).not.toHaveBeenCalled();
            expect(chatHistoryManager.deleteSession).not.toHaveBeenCalled();
            expect(toolUiProvider.enrichHistory).not.toHaveBeenCalled();
            expect(postMessageSpy).not.toHaveBeenCalled();

            postMessageSpy.mockRestore();
        });
    });
});
