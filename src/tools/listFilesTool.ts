import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IDirectoryReader, IPathResolver, IToolResult, IIgnoreManager } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';

const ListFilesSchema = z.object({
    directory: z.string().optional(),
    recursive: z.boolean().optional().default(false),
}).strict();

type ListFilesArgs = z.infer<typeof ListFilesSchema>;

export class ListFilesTool extends BaseTool<ListFilesArgs> {
    readonly definition: IToolDefinition = {
        name: 'list_files',
        description: 'List files in the workspace directory.',
        parameters: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    description: 'The directory to list files from (relative to workspace root). Defaults to root if not provided.',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Whether to list files recursively in subdirectories. Defaults to false.',
                },
            },
        },
    };

    readonly schema = ListFilesSchema;

    constructor(
        private workspaceProvider: IWorkspaceProvider,
        private directoryProvider: IDirectoryReader,
        private pathResolver: IPathResolver,
        private ignoreManager: IIgnoreManager
    ) {
        super();
    }

    formatMessage(args: ListFilesArgs): string {
        const dirDesc = args.directory || 'the root directory';
        const recDesc = args.recursive ? ' (recursively)' : '';
        return `Listing files in ${dirDesc}${recDesc}`;
    }

    async execute(args: ListFilesArgs, _signal?: AbortSignal, _toolCallId?: string): Promise<IToolResult> {
        const rootPath = this.workspaceProvider.rootPath();
        if (!rootPath) {
            return { content: AGENT_MESSAGES.ERROR_NO_WORKSPACE, success: false };
        }

        const dirPath = args.directory ? this.pathResolver.join(rootPath, args.directory) : rootPath;
        const resolvedPath = this.pathResolver.resolve(dirPath);

        // Security check: ensure resolved path is within workspace root
        if (!resolvedPath.startsWith(rootPath)) {
            return { content: AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE, success: false };
        }

        try {
            if (!this.directoryProvider.exists(dirPath)) {
                return { content: `Error: Directory ${args.directory} does not exist.`, success: false };
            }

            const results: string[] = [];
            await this.walk(dirPath, args.recursive || false, results);

            // Sort results for consistency
            results.sort();

            return { content: JSON.stringify(results, null, 2), success: true };
        } catch (error: any) {
            return { content: `Error listing files: ${error.message}`, success: false };
        }
    }

    private async walk(currentPath: string, recursive: boolean, results: string[]): Promise<void> {
        const files = this.directoryProvider.readdir(currentPath);
        if (!files) {
            return;
        }

        const rootPath = this.workspaceProvider.rootPath()!;

        for (const file of files) {
            const fullPath = this.pathResolver.join(currentPath, file);
            
            // Security check: ensure path is not ignored
            if (await this.ignoreManager.shouldIgnore(fullPath)) {
                continue;
            }

            if (this.directoryProvider.isDirectory(fullPath)) {
                if (recursive) {
                    await this.walk(fullPath, recursive, results);
                } else {
                    // For non-recursive, we might want to indicate it's a directory
                    // but the original implementation just returned the names.
                    // We'll stick to the original behavior of returning names in the current dir.
                    results.push(this.pathResolver.relative(rootPath, fullPath) + '/');
                }
            } else {
                results.push(this.pathResolver.relative(rootPath, fullPath));
            }
        }
    }
}
