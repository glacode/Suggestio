import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IPathResolver, IFileContentReader, IFileContentWriter, IToolResult, IEventBus, IIgnoreManager } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';

const ReplaceTextSchema = z.object({
    path: z.string().describe('The path of the file to edit (relative to workspace root).'),
    old_string: z.string().describe('The exact block of code to find. Must match exactly including indentation and newlines.'),
    new_string: z.string().describe('The new code to replace it with.'),
}).strict();

type ReplaceTextArgs = z.infer<typeof ReplaceTextSchema>;

/**
 * Tool for replacing a specific block of text within a file surgically.
 */
export class ReplaceTextTool extends BaseTool<ReplaceTextArgs> {
    readonly definition: IToolDefinition = {
        name: 'replace_text',
        description: 'Replace a specific block of text in a file with new content. The old_string must match exactly, including indentation and newlines. If multiple occurrences exist, provide more context to make it unique.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path of the file to edit (relative to workspace root).',
                },
                old_string: {
                    type: 'string',
                    description: 'The exact block of code to find. Must match exactly including indentation and newlines.',
                },
                new_string: {
                    type: 'string',
                    description: 'The new code to replace it with.',
                },
            },
            required: ['path', 'old_string', 'new_string'],
        },
    };

    readonly schema = ReplaceTextSchema;

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

    formatMessage(args: ReplaceTextArgs): string {
        return `Replacing text in ${args.path}`;
    }

    async execute(args: ReplaceTextArgs, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult> {
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

        // 1. Read existing content
        let oldContent = '';
        try {
            const readResult = this.fileReader.read(resolvedPath);
            if (readResult === undefined) {
                 return { content: `Error: Could not read file ${args.path}. Ensure the file exists.`, success: false };
            }
            oldContent = readResult;
        } catch (e: any) {
            return { content: `Error reading file ${args.path}: ${e.message}`, success: false };
        }

        // 2. Find and replace with strict uniqueness check
        const parts = oldContent.split(args.old_string);
        const occurrences = parts.length - 1;

        if (occurrences === 0) {
            return { 
                content: `Error: The old_string was not found in ${args.path}. Make sure it matches exactly, including indentation and newlines.`, 
                success: false 
            };
        }
        if (occurrences > 1) {
            return { 
                content: `Error: Multiple occurrences of old_string found in ${args.path}. Please provide more context (surrounding lines) to make the replacement unique.`, 
                success: false 
            };
        }

        const newContent = oldContent.replace(args.old_string, args.new_string);

        // 3. Request confirmation with diff data
        if (toolCallId) {
            const userDecision = await this.requestUserConfirmation(
                toolCallId,
                this.eventBus,
                `Allow Suggestio to replace text in ${args.path}?`,
                {
                    oldContent,
                    newContent,
                    filePath: args.path
                },
                signal
            );

            if (userDecision !== 'allow') {
                return { content: `Error: User denied permission to replace text in ${args.path}.`, success: false };
            }
        }

        // 4. Perform the write
        try {
            this.fileWriter.write(resolvedPath, newContent);
            return { content: `Successfully replaced text in ${args.path}`, success: true };
        } catch (error: any) {
            return { content: `Error writing to file: ${error.message}`, success: false };
        }
    }
}
