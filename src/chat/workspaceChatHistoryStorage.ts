import type { 
    IChatSession, 
    IWorkspaceProvider, 
    IFileContentReader, 
    IFileContentWriter, 
    IPathResolver, 
    IDirectoryCreator,
    IDirectoryReader,
    IWorkspaceChatHistoryStorage
} from '../types.js';

/**
 * Handles persistence of chat sessions to a JSON file within the workspace storage.
 * This class is the single authority for the storage strategy and location.
 */
export class WorkspaceChatHistoryStorage implements IWorkspaceChatHistoryStorage {
    private readonly STORAGE_FILE = 'chat_history.json';

    constructor(
        private readonly workspaceProvider: IWorkspaceProvider,
        private readonly fileReader: IFileContentReader,
        private readonly fileWriter: IFileContentWriter,
        private readonly pathResolver: IPathResolver,
        private readonly directoryCreator: IDirectoryCreator,
        private readonly directoryReader: IDirectoryReader
    ) {}

    /**
     * Loads all saved chat sessions.
     */
    public loadSessions(): IChatSession[] {
        const filePath = this.getStoragePath();
        if (!filePath || !this.directoryReader.exists(filePath)) {
            return [];
        }

        try {
            const content = this.fileReader.read(filePath);
            if (!content) {
                return [];
            }
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to load chat history:', error);
            return [];
        }
    }

    /**
     * Saves chat sessions, enforcing the 20-session limit.
     */
    public saveSessions(sessions: IChatSession[]): void {
        const filePath = this.getStoragePath();
        if (!filePath) {
            return;
        }

        // Enforce limit: last 20 sessions
        const limitedSessions = sessions.slice(-20);

        try {
            const storageDir = this.getStorageDir();
            if (storageDir && !this.directoryReader.exists(storageDir)) {
                this.directoryCreator.mkdir(storageDir, { recursive: true });
            }

            this.fileWriter.write(filePath, JSON.stringify(limitedSessions, null, 2));
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    }

    private getStorageDir(): string | undefined {
        // VS Code managed storage path is workspace-specific and safe from git
        return this.workspaceProvider.storagePath();
    }

    private getStoragePath(): string | undefined {
        const dir = this.getStorageDir();
        if (!dir) {
            return undefined;
        }
        return this.pathResolver.join(dir, this.STORAGE_FILE);
    }
}
