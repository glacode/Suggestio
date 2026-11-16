import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IPathResolver, IToolResult, IWorkspaceScanner } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';
import { resolveWorkspaceTarget } from './pathContainment.js';

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
        private pathResolver: IPathResolver,
        private workspaceScanner: IWorkspaceScanner
    ) {
        super();
    }

    formatMessage(args: ListFilesArgs): string {
        const dirDesc = args.directory || 'the root directory';
        const recDesc = args.recursive ? ' (recursively)' : '';
        return `Listing files in ${dirDesc}${recDesc}`;
    }

    async execute(args: ListFilesArgs, _signal?: AbortSignal, _toolCallId?: string): Promise<IToolResult> {
        const target = resolveWorkspaceTarget(this.pathResolver, this.workspaceProvider.rootPath(), args.directory ?? '');
        if (!target.ok) {
            return {
                content: target.error === 'NO_WORKSPACE'
                    ? AGENT_MESSAGES.ERROR_NO_WORKSPACE
                    : AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE,
                success: false
            };
        }
        const resolvedPath = target.resolvedPath;

        try {
            const results = await this.workspaceScanner.scan(resolvedPath, { recursive: args.recursive || false });
            return { content: JSON.stringify(results, null, 2), success: true };
        } catch (error: any) {
            return { content: `Error listing files: ${error.message}`, success: false };
        }
    }
}
