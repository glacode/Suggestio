import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IDirectoryReader, IPathResolver, IToolResult, IIgnoreManager } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';

const ListFilesSchema = z.object({
    directory: z.string().optional(),
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
        return `Listing files in ${args.directory || 'the root directory'}`;
    }

    async execute(args: ListFilesArgs, _signal?: AbortSignal, _toolCallId?: string): Promise<IToolResult> {
        // await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds, uncomment to simulate delay
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

            const files = this.directoryProvider.readdir(dirPath);
            if (!files) {
                return { content: `Error: Failed to read directory ${args.directory}.`, success: false };
            }

            const filteredFiles: string[] = [];
            for (const file of files) {
                const fullPath = this.pathResolver.join(dirPath, file);
                if (!await this.ignoreManager.shouldIgnore(fullPath)) {
                    filteredFiles.push(file);
                }
            }

            return { content: JSON.stringify(filteredFiles, null, 2), success: true };
        } catch (error: any) {
            return { content: `Error listing files: ${error.message}`, success: false };
        }
    }
}
