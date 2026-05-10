import type { 
    IChatSession, 
    IWorkspaceProvider, 
    IFileContentReader, 
    IFileContentWriter, 
    IPathResolver, 
    IDirectoryCreator,
    IDirectoryReader,
    IWorkspaceChatHistoryStorage,
    IFileDeleter,
    IStorageConfig
} from '../types.js';

/**
 * Handles persistence of chat sessions to individual JSON files.
 * This class manages its own subfolder and session limit.
 */
export class WorkspaceChatHistoryStorage implements IWorkspaceChatHistoryStorage {
    private readonly STORAGE_DIR_NAME = 'chatSessions';

    constructor(
        private readonly workspaceProvider: IWorkspaceProvider,
        private readonly fileReader: IFileContentReader,
        private readonly fileWriter: IFileContentWriter,
        private readonly pathResolver: IPathResolver,
        private readonly directoryCreator: IDirectoryCreator,
        private readonly directoryReader: IDirectoryReader,
        private readonly fileDeleter: IFileDeleter,
        private readonly config: IStorageConfig
    ) {}

    /**
     * Loads all saved chat sessions, sorted by timestamp (newest first).
     */
    public loadSessions(): IChatSession[] {
        const storageDir = this.getStorageDir();
        if (!storageDir || !this.directoryReader.exists(storageDir)) {
            return [];
        }

        try {
            const files = this.directoryReader.readdir(storageDir);
            if (!files) {
                return [];
            }

            const sessions: IChatSession[] = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = this.pathResolver.join(storageDir, file);
                    const content = this.fileReader.read(filePath);
                    if (content) {
                        try {
                            sessions.push(JSON.parse(content));
                        } catch (e) {
                            console.error(`Failed to parse session file ${file}:`, e);
                        }
                    }
                }
            }
            // Sort by timestamp (newest first)
            return sessions.sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error('Failed to load chat history:', error);
            return [];
        }
    }

    /**
     * Saves a single chat session and prunes old ones if it's a new file.
     */
    public saveSession(session: IChatSession): void {
        const storageDir = this.getStorageDir();
        if (!storageDir) {
            return;
        }

        const fileName = `${session.id}.json`;
        const filePath = this.pathResolver.join(storageDir, fileName);

        try {
            if (!this.directoryReader.exists(storageDir)) {
                this.directoryCreator.mkdir(storageDir, { recursive: true });
            }

            const isNewFile = !this.directoryReader.exists(filePath);
            
            // Save the session
            this.fileWriter.write(filePath, JSON.stringify(session, null, 2));

            // Only prune if we just added a NEW session to the collection
            if (isNewFile) {
                this.pruneOldSessions(storageDir);
            }
        } catch (error) {
            console.error('Failed to save chat session:', error);
        }
    }

    /**
     * Deletes sessions beyond the MAX_SESSIONS limit.
     */
    private pruneOldSessions(storageDir: string): void {
        const files = this.directoryReader.readdir(storageDir);
        if (!files) {
            return;
        }

        // Collect all JSON files with their paths
        const jsonFiles = files
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: this.pathResolver.join(storageDir, f)
            }));

        if (jsonFiles.length > this.config.maxSavedChatSessions) {
            // Since filenames ARE timestamps, we sort by name descending to get newest first
            jsonFiles.sort((a, b) => b.name.localeCompare(a.name));

            // Delete files beyond the limit
            const toDelete = jsonFiles.slice(this.config.maxSavedChatSessions);
            for (const fileInfo of toDelete) {
                try {
                    this.fileDeleter.delete(fileInfo.path);
                } catch (e) {
                    console.error(`Failed to delete old session ${fileInfo.name}:`, e);
                }
            }
        }
    }

    private getStorageDir(): string | undefined {
        const baseDir = this.workspaceProvider.storagePath();
        if (!baseDir) {
            return undefined;
        }
        return this.pathResolver.join(baseDir, this.STORAGE_DIR_NAME);
    }
}
