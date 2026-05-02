import { 
    IChatMessage, 
    ChatHistory, 
    IPersistentChatHistoryManager, 
    IChatSession,
    IChatHistoryManager,
    IWorkspaceChatHistoryStorage
} from '../types.js';

/**
 * Manages chat history with persistence and debounced auto-save.
 */
export class PersistentChatHistoryManager implements IPersistentChatHistoryManager {
    private currentSessionId: string;
    private sessions: IChatSession[] = [];
    private saveTimeout: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 2000;

    constructor(
        private readonly historyManager: IChatHistoryManager,
        private readonly storage: IWorkspaceChatHistoryStorage
    ) {
        this.currentSessionId = this.generateId();
        this.sessions = this.storage.loadSessions();
    }

    public addMessage(message: IChatMessage): void {
        this.historyManager.addMessage(message);
        this.scheduleSave();
    }

    public getChatHistory(): ChatHistory {
        return this.historyManager.getChatHistory();
    }

    public clearHistory(): void {
        this.historyManager.clearHistory();
        this.scheduleSave();
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

    private scheduleSave(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => this.save(), this.DEBOUNCE_MS);
    }

    private save(): void {
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
