import { IIgnoreManager, IWorkspaceProvider, IFileContentReader, IPathResolver } from '../types.js';
import { globToRegex } from '../utils/globMatcher.js';
import { normalizePath } from '../utils/pathUtils.js';

export class IgnoreManager implements IIgnoreManager {
    private ignorePatterns: RegExp[] = [];
    private readonly workspaceProvider: IWorkspaceProvider;
    private readonly fileProvider: IFileContentReader;
    private readonly pathResolver: IPathResolver;

    constructor(workspaceProvider: IWorkspaceProvider, fileProvider: IFileContentReader, pathResolver: IPathResolver) {
        this.workspaceProvider = workspaceProvider;
        this.fileProvider = fileProvider;
        this.pathResolver = pathResolver;
        this.loadIgnoreFiles();
    }

    private loadIgnoreFiles(): void {
        const workspaceRoot = this.workspaceProvider.rootPath();
        if (!workspaceRoot) {
            return;
        }

        const ignoreFilePaths = [
            this.pathResolver.join(workspaceRoot, '.gitignore'),
            this.pathResolver.join(workspaceRoot, '.vscodeignore'),
        ];

        for (const filePath of ignoreFilePaths) {
            const content = this.fileProvider.read(filePath);
            if (content) {
                const patterns = content.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                
                this.ignorePatterns.push(...patterns.map(globToRegex));
            }
        }
        
        // Also add .env as a hardcoded pattern
        this.ignorePatterns.push(globToRegex('.env'));
    }

    async shouldIgnore(filePath: string): Promise<boolean> {
        const workspaceRoot = this.workspaceProvider.rootPath();
        if (!workspaceRoot) {
            return false;
        }

        const relativePath = normalizePath(this.pathResolver.relative(workspaceRoot, filePath));

        for (const pattern of this.ignorePatterns) {
            if (pattern.test(relativePath) || pattern.test(this.pathResolver.basename(filePath))) {
                return true;
            }
        }
        return false;
    }
}
