import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IPathResolver, IFileContentReader, IToolResult, IEventBus, IIgnoreManager } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';

const ReadFileSchema = z.object({
    path: z.string().describe('The path of the file to read (relative to workspace root).'),
    start_line: z.number().optional().describe('The line number to start reading from (1-indexed). Use this for large files to avoid exceeding context limits.'),
    end_line: z.number().optional().describe('The line number to stop reading at (1-indexed). Use this for large files to avoid exceeding context limits.'),
}).strict();

type ReadFileArgs = z.infer<typeof ReadFileSchema>;

/**
 * Tool for reading the content of a file within the workspace.
 */
export class ReadFileTool extends BaseTool<ReadFileArgs> {
    readonly definition: IToolDefinition = {
        name: 'read_file',
        description: 'Read the content of a file in the workspace.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path of the file to read (relative to workspace root).',
                },
                start_line: {
                    type: 'number',
                    description: 'The line number to start reading from (1-indexed). Use this for large files to avoid exceeding context limits.',
                },
                end_line: {
                    type: 'number',
                    description: 'The line number to stop reading at (1-indexed). Use this for large files to avoid exceeding context limits.',
                },
            },
            required: ['path'],
        },
    };

    readonly schema = ReadFileSchema;

    constructor(
        private workspaceProvider: IWorkspaceProvider,
        private fileReader: IFileContentReader,
        private pathResolver: IPathResolver,
        private eventBus: IEventBus,
        private ignoreManager: IIgnoreManager,
        public readonly requireUserConfirmation: boolean = true
    ) {
        super();
    }

    formatMessage(args: ReadFileArgs): string {
        if (args.start_line || args.end_line) {
            return `Reading lines ${args.start_line || 1} to ${args.end_line || 'end'} of file ${args.path}`;
        }
        return `Reading file ${args.path}`;
    }

    async execute(args: ReadFileArgs, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult> {
        const rootPath = this.workspaceProvider.rootPath();
        if (!rootPath) {
            return { content: AGENT_MESSAGES.ERROR_NO_WORKSPACE, success: false };
        }

        const fullPath = this.pathResolver.join(rootPath, args.path);
        const resolvedPath = this.pathResolver.resolve(fullPath);

        // Security check: ensure resolved path is within workspace root
        if (!resolvedPath.startsWith(rootPath)) {
            return { content: AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE, success: false };
        }

        // Security check: ensure path is not ignored
        if (await this.ignoreManager.shouldIgnore(resolvedPath)) {
            return { content: AGENT_MESSAGES.ERROR_PATH_IGNORED(args.path), success: false };
        }

        // Confirmation handshake
        if (this.requireUserConfirmation && toolCallId) {
            const userDecision = await this.requestUserConfirmation(
                toolCallId,
                this.eventBus,
                `Allow Suggestio to read ${args.path}?`,
                undefined,
                signal
            );

            if (userDecision !== 'allow') {
                return { content: `Error: User denied access to read file ${args.path}.`, success: false };
            }
        }

        try {
            const content = this.fileReader.read(resolvedPath, args.start_line, args.end_line);
            if (content === undefined) {
                return { content: `Error: Failed to read file ${args.path}. Ensure the file exists and is accessible.`, success: false };
            }
            return { content, success: true };
        } catch (error: any) {
            return { content: `Error reading file: ${error.message}`, success: false };
        }
    }
}
