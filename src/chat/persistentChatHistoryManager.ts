import { 
    IChatMessage, 
    ChatHistory, 
    IPersistentChatHistoryManager, 
    IChatSession,
    IChatHistoryManager,
    IWorkspaceChatHistoryStorage
} from '../types.js';

/**
 * Manages chat history with manual persistence support.
 */
export class PersistentChatHistoryManager implements IPersistentChatHistoryManager {
    private currentSessionId: string;
    private sessions: IChatSession[] = [];

    constructor(
        private readonly historyManager: IChatHistoryManager,
        private readonly storage: IWorkspaceChatHistoryStorage
    ) {
        this.currentSessionId = this.generateId();
        this.sessions = this.storage.loadSessions();
    }

    public addMessage(message: IChatMessage): void {
        this.historyManager.addMessage(message);
    }

    public getChatHistory(): ChatHistory {
        return this.historyManager.getChatHistory();
    }

    public clearHistory(): void {
        this.historyManager.clearHistory();
    }

    public async getSessions(): Promise<IChatSession[]> {
        // Return sessions sorted by timestamp (newest first)
        return [...this.sessions].sort((a, b) => b.timestamp - a.timestamp);
    }

    public async loadSession(sessionId: string): Promise<void> {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSessionId = session.id;
            this.historyManager.clearHistory();
            session.history.forEach(msg => this.historyManager.addMessage(msg));
        }
    }

    public newSession(): void {
        this.currentSessionId = this.generateId();
        this.historyManager.clearHistory();
    }

    /**
     * Persists the current session to the storage.
     */
    public persistCurrentSession(): void {
        const history = this.historyManager.getChatHistory();
        if (history.length === 0) {
            return;
        }

        const title = this.generateTitle(history);

        const session: IChatSession = {
            id: this.currentSessionId,
            title,
            timestamp: parseInt(this.currentSessionId),
            history
        };

        this.storage.saveSession(session);
        // Refresh local cache
        this.sessions = this.storage.loadSessions();
    }

    private generateTitle(history: ChatHistory): string {
        const firstUserMessage = history.find(m => m.role === 'user');
        if (!firstUserMessage) {
            return 'New Chat';
        }
        const text = firstUserMessage.content.trim();
        return text.length > 30 ? text.substring(0, 30) + '...' : text;
    }

    private generateId(): string {
        return Date.now().toString();
    }
}
