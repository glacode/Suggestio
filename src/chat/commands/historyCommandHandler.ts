import type {
    IPersistentChatHistoryManager,
    IToolUiProvider,
    IWebviewView,
    WebviewMessage
} from '../../types.js';
import { WEBVIEW_COMMANDS, EXTENSION_EVENTS } from '../../constants/protocol.js';
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

    async handle(message: WebviewMessage, ctx: ICommandContext): Promise<void> {
        if (message.command === WEBVIEW_COMMANDS.CLEAR_HISTORY) {
            await this._handleClearHistory();
        } else if (message.command === WEBVIEW_COMMANDS.GET_SESSIONS) {
            await this._handleGetSessions(ctx.webviewView);
        } else if (message.command === WEBVIEW_COMMANDS.LOAD_SESSION) {
            await this._handleLoadSession(message, ctx.webviewView);
        } else if (message.command === WEBVIEW_COMMANDS.DELETE_SESSION) {
            await this._handleDeleteSession(message, ctx.webviewView);
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

    private async _handleLoadSession(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.LOAD_SESSION }>, webviewView: IWebviewView): Promise<void> {
        await this._chatHistoryManager.loadSession(message.sessionId);
        const enrichedHistory = this._toolUiProvider.enrichHistory(this._chatHistoryManager.getChatHistory());
        webviewView.webview.postMessage({
            type: EXTENSION_EVENTS.CHAT_HISTORY_LOADED,
            history: enrichedHistory
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
