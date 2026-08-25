import type {
    IPersistentChatHistoryManager,
    IToolUiProvider,
    IWebviewView,
    WebviewMessage,
    IStoredChatMessage
} from '../../types.js';
import { WEBVIEW_COMMANDS, EXTENSION_EVENTS, MESSAGE_SENDERS } from '../../constants/protocol.js';
import { IWebviewCommandHandler, ICommandContext } from '../chatCommandHandler.js';

/**
 * Arguments for the HistoryCommandHandler constructor.
 */
export interface IHistoryCommandHandlerArgs {
    chatHistoryManager: IPersistentChatHistoryManager;
    toolUiProvider: IToolUiProvider;
}

/**
 * Handles history-related commands: CLEAR_HISTORY, GET_SESSIONS, LOAD_SESSION.
 */
export class HistoryCommandHandler implements IWebviewCommandHandler {
    private readonly _chatHistoryManager: IPersistentChatHistoryManager;
    private readonly _toolUiProvider: IToolUiProvider;

    constructor({
        chatHistoryManager,
        toolUiProvider
    }: IHistoryCommandHandlerArgs) {
        this._chatHistoryManager = chatHistoryManager;
        this._toolUiProvider = toolUiProvider;
    }

    canHandle(command: string): boolean {
        return command === WEBVIEW_COMMANDS.CLEAR_HISTORY
            || command === WEBVIEW_COMMANDS.GET_SESSIONS
            || command === WEBVIEW_COMMANDS.LOAD_SESSION
            || command === WEBVIEW_COMMANDS.DELETE_SESSION;
    }

    async handle(message: WebviewMessage, commandContext: ICommandContext): Promise<void> {
        if (message.command === WEBVIEW_COMMANDS.CLEAR_HISTORY) {
            await this._handleClearHistory();
        } else if (message.command === WEBVIEW_COMMANDS.GET_SESSIONS) {
            await this._handleGetSessions(commandContext.webviewView);
        } else if (message.command === WEBVIEW_COMMANDS.LOAD_SESSION) {
            await this._handleLoadSession(message, commandContext);
        } else if (message.command === WEBVIEW_COMMANDS.DELETE_SESSION) {
            await this._handleDeleteSession(message, commandContext.webviewView);
        }
    }

    private async _handleClearHistory(): Promise<void> {
        this._chatHistoryManager.clearHistory();
    }

    private async _handleGetSessions(webviewView: IWebviewView): Promise<void> {
        const sessions = await this._chatHistoryManager.getSessions();
        webviewView.webview.postMessage({
            type: EXTENSION_EVENTS.SESSIONS_LIST,
            sessions: sessions.map(s => {
                const firstUserMessage = s.history.find(m => m.role === 'user');
                return {
                    id: s.id,
                    title: s.title,
                    timestamp: s.timestamp,
                    fullPrompt: firstUserMessage ? firstUserMessage.content.trim() : undefined
                };
            })
        });
    }

    private async _handleLoadSession(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.LOAD_SESSION }>, ctx: ICommandContext): Promise<void> {
        const { webviewView, logger } = ctx;
        try {
            await this._chatHistoryManager.loadSession(message.sessionId);
            const history = this._chatHistoryManager.getChatHistory();
            
            // Validate and clean history before enrichment
            const validatedHistory = this._validateAndCleanHistory(history, logger);
            
            const enrichedHistory = this._toolUiProvider.enrichHistory(validatedHistory);
            webviewView.webview.postMessage({
                type: EXTENSION_EVENTS.CHAT_HISTORY_LOADED,
                history: enrichedHistory
            });
        } catch (error) {
            logger.error(`Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
            webviewView.webview.postMessage({
                sender: MESSAGE_SENDERS.ASSISTANT,
                type: EXTENSION_EVENTS.ERROR,
                text: `Failed to load session: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    /**
     * Validates and cleans chat history to handle malformed data
     */
    private _validateAndCleanHistory(history: IStoredChatMessage[], logger: ICommandContext['logger']): IStoredChatMessage[] {
        return history.map(message => {
            // Clean tool calls - remove nulls and fix string arguments
            if ('tool_calls' in message && Array.isArray(message.tool_calls)) {
                const cleanedToolCalls = message.tool_calls
                    .filter((call): call is NonNullable<typeof call> => call !== null)
                    .map(call => {
                        if (call && 'function' in call && 'arguments' in call.function) {
                            // Arguments should be strings, but validate they're valid JSON strings
                            if (typeof call.function.arguments === 'string') {
                                try {
                                    // Validate it's valid JSON (but keep as string)
                                    JSON.parse(call.function.arguments);
                                } catch (e) {
                                    logger.warn(`Invalid JSON in tool call arguments, using empty object: ${call.function.arguments}`);
                                    call.function.arguments = '{}';
                                }
                            } else if (call.function.arguments === undefined) {
                                // Ensure arguments field exists
                                call.function.arguments = '{}';
                            }
                        }
                        return call;
                    });
                
                return { ...message, tool_calls: cleanedToolCalls };
            }
            return message;
        });
    }

    private async _handleDeleteSession(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.DELETE_SESSION }>, webviewView: IWebviewView): Promise<void> {
        await this._chatHistoryManager.deleteSession(message.sessionId);
        const sessions = await this._chatHistoryManager.getSessions();
        webviewView.webview.postMessage({
            type: EXTENSION_EVENTS.SESSIONS_LIST,
            sessions: sessions.map(s => {
                const firstUserMessage = s.history.find(m => m.role === 'user');
                return {
                    id: s.id,
                    title: s.title,
                    timestamp: s.timestamp,
                    fullPrompt: firstUserMessage ? firstUserMessage.content.trim() : undefined
                };
            })
        });
    }
}
