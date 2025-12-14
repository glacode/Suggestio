import { IIgnoreManager, IWorkspaceProvider, IFileContentProvider, IPathResolver } from './types.js';

// A very simple glob-to-regex converter
function globToRegex(pattern: string): RegExp {
    if (pattern.startsWith('**/')) {
        pattern = pattern.substring(3);
    }
    
    let regexString = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*') 
        .replace(/\*/g, '[^/]*');

    if (pattern.endsWith('/')) {
        return new RegExp(`^${regexString.slice(0, -1)}/`);
    } 
    
    if (!pattern.includes('/')) {
        if (!pattern.startsWith('*')) {
            return new RegExp(`^${regexString}(\\/.*)?$`);
        }
    }
    
    return new RegExp(`^${regexString}$`);
}

export class IgnoreManager implements IIgnoreManager {
    private ignorePatterns: RegExp[] = [];
    private readonly workspaceProvider: IWorkspaceProvider;
    private readonly fileProvider: IFileContentProvider;
    private readonly pathResolver: IPathResolver;

    constructor(workspaceProvider: IWorkspaceProvider, fileProvider: IFileContentProvider, pathResolver: IPathResolver) {
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

        const relativePath = this.pathResolver.relative(workspaceRoot, filePath);

        for (const pattern of this.ignorePatterns) {
            if (pattern.test(relativePath) || pattern.test(this.pathResolver.basename(filePath))) {
                return true;
            }
        }
        return false;
    }
}