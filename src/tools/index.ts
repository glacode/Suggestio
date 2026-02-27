import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IDirectoryReader, IPathResolver, IToolImplementation } from '../types.js';
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
        private pathResolver: IPathResolver
    ) {
        super();
    }

    formatMessage(args: ListFilesArgs): string {
        return `Listing files in ${args.directory || 'the root directory'}`;
    }

    async execute(args: ListFilesArgs, _signal?: AbortSignal): Promise<string> {
        const rootPath = this.workspaceProvider.rootPath();
        if (!rootPath) {
            return AGENT_MESSAGES.ERROR_NO_WORKSPACE;
        }

        const dirPath = args.directory ? this.pathResolver.join(rootPath, args.directory) : rootPath;
        const resolvedPath = this.pathResolver.resolve(dirPath);

        // Security check: ensure resolved path is within workspace root
        if (!resolvedPath.startsWith(rootPath)) {
            return `Error: Access denied. Path must be within the workspace.`;
        }

        try {
            if (!this.directoryProvider.exists(dirPath)) {
                return `Error: Directory ${args.directory} does not exist.`;
            }

            const files = this.directoryProvider.readdir(dirPath);
            if (!files) {
                return `Error: Failed to read directory ${args.directory}.`;
            }
            return JSON.stringify(files, null, 2);
        } catch (error: any) {
            return `Error listing files: ${error.message}`;
        }
    }
}

export function getTools(
    workspaceProvider: IWorkspaceProvider,
    directoryProvider: IDirectoryReader,
    pathResolver: IPathResolver
): IToolImplementation[] {
    return [
        new ListFilesTool(workspaceProvider, directoryProvider, pathResolver)
    ];
}