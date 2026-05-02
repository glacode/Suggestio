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
        this.sessions = this.storage.loadSessions();
        this.currentSessionId = this.generateId();
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
            // Optional: could remove current session if it becomes empty, 
            // but usually we just don't update it in the persisted list if it's already gone.
            // For now, let's keep it simple.
            return;
        }

        const title = this.generateTitle(history);
        const existingSessionIndex = this.sessions.findIndex(s => s.id === this.currentSessionId);

        const session: IChatSession = {
            id: this.currentSessionId,
            title,
            timestamp: Date.now(),
            history
        };

        if (existingSessionIndex !== -1) {
            this.sessions[existingSessionIndex] = session;
        } else {
            this.sessions.push(session);
        }

        this.storage.saveSessions(this.sessions);
        // Refresh session list after save
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
        return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
    }
}
