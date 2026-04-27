import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IPathResolver, IFileContentReader, IFileContentWriter, IToolResult, IEventBus, IIgnoreManager } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';

const WriteFileSchema = z.object({
    path: z.string().describe('The path of the file to edit (relative to workspace root).'),
    content: z.string().describe('The full new content of the file.'),
}).strict();

type WriteFileArgs = z.infer<typeof WriteFileSchema>;

/**
 * Tool for writing (overwriting) a file within the workspace after user confirmation.
 */
export class WriteFileTool extends BaseTool<WriteFileArgs> {
    readonly definition: IToolDefinition = {
        name: 'write_file',
        description: 'Write the full content to a file. Use this for creating new files or when a file needs to be completely rewritten.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path of the file to edit (relative to workspace root).',
                },
                content: {
                    type: 'string',
                    description: 'The full new content of the file.',
                },
            },
            required: ['path', 'content'],
        },
    };

    readonly schema = WriteFileSchema;

    /**
     * Internal UI hint to keep the UI clean by collapsing full-file content by default.
     */
    readonly uiOptions = {
        collapseByDefault: true,
    };

    constructor(
        private workspaceProvider: IWorkspaceProvider,
        private fileReader: IFileContentReader,
        private fileWriter: IFileContentWriter,
        private pathResolver: IPathResolver,
        private eventBus: IEventBus,
        private ignoreManager: IIgnoreManager
    ) {
        super();
    }

    formatMessage(args: WriteFileArgs): string {
        return `Writing file ${args.path}`;
    }

    async execute(args: WriteFileArgs, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult> {
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

        // 1. Read existing content for diffing
        let oldContent = '';
        try {
            const readResult = this.fileReader.read(resolvedPath);
            if (readResult !== undefined) {
                oldContent = readResult;
            }
        } catch (e) {
            // If file doesn't exist yet, we treat it as empty
            oldContent = '';
        }

        // 2. Request confirmation with diff data
        if (toolCallId) {
            const userDecision = await this.requestUserConfirmation(
                toolCallId,
                this.eventBus,
                `Allow Suggestio to write to ${args.path}?`,
                {
                    oldContent,
                    newContent: args.content,
                    filePath: args.path
                },
                signal
            );

            if (userDecision !== 'allow') {
                return { content: `Error: User denied permission to write to file ${args.path}.`, success: false };
            }
        }

        // 3. Perform the write
        try {
            this.fileWriter.write(resolvedPath, args.content);
            return { content: `Successfully wrote ${args.path}`, success: true };
        } catch (error: any) {
            return { content: `Error writing to file: ${error.message}`, success: false };
        }
    }
}
