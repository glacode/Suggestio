import { z } from 'zod';
import { IWorkspaceProvider, IToolDefinition, IToolResult, IEventBus, ICommandExecutor, ICommandValidator, ICommandAutoAcceptManager } from '../types.js';
import { AGENT_MESSAGES } from '../constants/messages.js';
import { BaseTool } from './baseTool.js';

const RunCommandSchema = z.object({
    command: z.string().describe('The shell command to execute.'),
}).strict();

type RunCommandArgs = z.infer<typeof RunCommandSchema>;

/**
 * Tool for executing shell commands in the workspace root.
 * Requires explicit user confirmation for every execution.
 */
export class RunCommandTool extends BaseTool<RunCommandArgs> {
    readonly definition: IToolDefinition = {
        name: 'run_command',
        description: "Execute a shell command in the workspace root. ONLY use this for tasks that cannot be accomplished with other specialized tools, such as running tests ('npm test'), building ('npm run build'), or checking environment versions ('node -v'). DO NOT use this for reading files, listing files, or searching for text if 'read_file', 'list_files', or 'grep_search' can be used instead.",
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: "The shell command to execute. Use specialized tools for file operations instead of shell-based alternatives like 'cat', 'ls', or 'grep'.",
                },
            },
            required: ['command'],
        },
    };

    readonly schema = RunCommandSchema;

    constructor(
        private workspaceProvider: IWorkspaceProvider,
        private commandExecutor: ICommandExecutor,
        private eventBus: IEventBus,
        private validator: ICommandValidator,
        private autoAcceptManager: ICommandAutoAcceptManager
    ) {
        super();
    }

    formatMessage(args: RunCommandArgs): string {
        return `Executing command: ${args.command}`;
    }

    async execute(args: RunCommandArgs, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult> {
        const rootPath = this.workspaceProvider.rootPath();
        if (!rootPath) {
            return { content: AGENT_MESSAGES.ERROR_NO_WORKSPACE, success: false };
        }

        const command = args.command.trim();

        // 1. Security validation (Blacklist)
        const validation = this.validator.validate(command);
        if (!validation.allowed) {
            return { 
                content: `Security Error: Command execution blocked. Reason: ${validation.reason || 'Prohibited pattern detected.'}`, 
                success: false 
            };
        }

        // 2. User confirmation (unless auto-accepted)
        if (toolCallId) {
            if (!this.autoAcceptManager.isAllowed(command)) {
                const userDecision = await this.requestUserConfirmation(
                    toolCallId,
                    this.eventBus,
                    `Allow Suggestio to run command: "${command}"?`,
                    undefined,
                    signal
                );

                if (userDecision === 'always-allow-command') {
                    this.autoAcceptManager.allowCommand(command);
                }

                if (userDecision !== 'allow' && userDecision !== 'always-allow-command') {
                    return { content: `Error: User denied permission to execute command: ${command}`, success: false };
                }
            }
        }

        try {
            // Notify the UI that the command is actually starting now.
            if (toolCallId) {
                this.eventBus.emit('agent:toolExecutionStarted', { toolCallId });
            }

            const result = await this.commandExecutor.execute(command, { 
                cwd: rootPath, 
                signal,
                onStdout: (data) => {
                    if (toolCallId) {
                        this.eventBus.emit('agent:toolOutput', { toolCallId, output: data });
                    }
                },
                onStderr: (data) => {
                    if (toolCallId) {
                        this.eventBus.emit('agent:toolOutput', { toolCallId, output: data });
                    }
                }
            });

            const output = [
                result.stdout,
                result.stderr ? `\nSTDERR:\n${result.stderr}` : '',
                result.exitCode !== 0 ? `\nCommand failed with exit code: ${result.exitCode}` : ''
            ].filter(Boolean).join('\n').trim();

            return { 
                content: output || 'Command executed successfully (no output).', 
                success: result.exitCode === 0 
            };
        } catch (error: any) {
            return { content: `Error executing command: ${error.message}`, success: false };
        }
    }
}
