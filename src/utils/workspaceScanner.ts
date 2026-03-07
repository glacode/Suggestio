import { IWorkspaceScanner, IWorkspaceProvider, IDirectoryReader, IPathResolver, IIgnoreManager } from '../types.js';

/**
 * WorkspaceScanner provides a reusable service for traversing the workspace file system.
 * It centralizes the logic for recursive directory walking while strictly adhering
 * to ignore rules and security constraints.
 */
export class WorkspaceScanner implements IWorkspaceScanner {
    constructor(
        private workspaceProvider: IWorkspaceProvider,
        private directoryProvider: IDirectoryReader,
        private pathResolver: IPathResolver,
        private ignoreManager: IIgnoreManager
    ) {}

    /**
     * Scans a directory and returns a list of visible files.
     * 
     * @param dirPath The absolute path of the directory to scan.
     * @param options Configuration for the scan (e.g., whether to recurse).
     * @returns A promise resolving to an array of file paths relative to the workspace root.
     */
    async scan(dirPath: string, options: { recursive: boolean }): Promise<string[]> {
        const rootPath = this.workspaceProvider.rootPath();
        if (!rootPath) {
            return [];
        }

        const results: string[] = [];
        await this.walk(dirPath, options.recursive, results);
        
        // Sorting ensures deterministic output for the LLM and easier testing.
        results.sort();
        return results;
    }

    /**
     * Core recursive traversal logic.
     * 
     * @param currentPath The current absolute path being processed.
     * @param recursive Whether to continue descending into subdirectories.
     * @param results The accumulator array for discovered file paths.
     */
    private async walk(currentPath: string, recursive: boolean, results: string[]): Promise<void> {
        const files = this.directoryProvider.readdir(currentPath);
        if (!files) {
            return;
        }

        const rootPath = this.workspaceProvider.rootPath()!;

        for (const file of files) {
            const fullPath = this.pathResolver.join(currentPath, file);
            
            // Security check: apply ignore patterns (.gitignore, .vscodeignore, .env, etc.)
            // We check this for both files and directories to avoid unnecessary traversal.
            if (await this.ignoreManager.shouldIgnore(fullPath)) {
                continue;
            }

            if (this.directoryProvider.isDirectory(fullPath)) {
                if (recursive) {
                    // Recurse into the subdirectory
                    await this.walk(fullPath, recursive, results);
                } else {
                    // If not recursive, we add the directory name with a trailing slash
                    // to indicate it is a directory in the shallow listing.
                    results.push(this.pathResolver.relative(rootPath, fullPath) + '/');
                }
            } else {
                // Add the file path relative to the workspace root
                results.push(this.pathResolver.relative(rootPath, fullPath));
            }
        }
    }
}
