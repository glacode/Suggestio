import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IPathResolver, IFileContentReader, IFileContentWriter, IToolResult, IEventBus, IUserConfirmationPayload, IIgnoreManager } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';

const EditFileSchema = z.object({
    path: z.string().describe('The path of the file to edit (relative to workspace root).'),
    content: z.string().describe('The full new content of the file.'),
}).strict();

type EditFileArgs = z.infer<typeof EditFileSchema>;

/**
 * Tool for editing (overwriting) a file within the workspace after user confirmation.
 */
export class EditFileTool extends BaseTool<EditFileArgs> {
    readonly definition: IToolDefinition = {
        name: 'edit_file',
        description: 'Overwrite a file in the workspace with new content.',
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

    readonly schema = EditFileSchema;

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

    formatMessage(args: EditFileArgs): string {
        return `Editing file ${args.path}`;
    }

    async execute(args: EditFileArgs, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult> {
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
            return { content: AGENT_MESSAGES.ERROR_PATH_IGNORED, success: false };
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
            const userDecisionPromise = new Promise<string>((resolve) => {
                const disposable = this.eventBus.on('user:confirmationResponse', (payload: IUserConfirmationPayload) => {
                    if (payload.toolCallId === toolCallId) {
                        disposable.dispose();
                        resolve(payload.decision);
                    }
                });

                if (signal) {
                    signal.addEventListener('abort', () => {
                        disposable.dispose();
                        resolve('deny');
                    }, { once: true });
                }
            });

            this.eventBus.emit('agent:requestConfirmation', {
                toolCallId,
                toolName: this.definition.name,
                message: `Allow Suggestio to apply changes to ${args.path}?`,
                diffData: {
                    oldContent,
                    newContent: args.content,
                    filePath: args.path
                }
            });

            const userDecision = await userDecisionPromise;

            if (userDecision !== 'allow') {
                return { content: `Error: User denied permission to edit file ${args.path}.`, success: false };
            }
        }

        // 3. Perform the write
        try {
            this.fileWriter.write(resolvedPath, args.content);
            return { content: `Successfully updated ${args.path}`, success: true };
        } catch (error: any) {
            return { content: `Error writing to file: ${error.message}`, success: false };
        }
    }
}
