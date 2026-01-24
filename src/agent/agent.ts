import { Config, ToolImplementation } from "../types.js";
import type { IChatHistoryManager, IPrompt, ChatMessage, ToolCall } from "../types.js";
import { IEventBus } from "../utils/eventBus.js";

export class Agent {
    constructor(
        private config: Config,
        private log: (message: string) => void,
        private chatHistoryManager: IChatHistoryManager,
        private tools: ToolImplementation[] = [],
        private eventBus?: IEventBus
    ) { }

    async run(prompt: IPrompt, onToken: (token: string) => void, signal?: AbortSignal): Promise<void> {
        const toolDefinitions = this.tools.map(t => t.definition);
        let currentPrompt = prompt;
        let iterations = 0;
        const maxIterations = this.config.maxAgentIterations ?? 5;

        while (iterations < maxIterations) {
            iterations++;

            const response: ChatMessage | null = await this.queryLLM(currentPrompt, onToken, toolDefinitions, signal);

            if (!response) {
                break;
            }

            this.chatHistoryManager.addMessage(response);

            if (this.shouldProcessToolCalls(response)) {
                await this.processToolCalls(response.tool_calls!);

                // After tool results are added, we need to query the LLM again to get the final answer.
                // We create a new prompt with the updated history.
                currentPrompt = this.createFollowUpPrompt();
                this.log("Re-querying LLM with tool results...");
                continue;
            }

            // No tool calls, we are done.
            break;
        }

        if (iterations >= maxIterations) {
            this.eventBus?.emit('agent:maxIterationsReached', { maxIterations });
        }
    }

    /**
     * Queries the LLM provider for a response.
     */
    private async queryLLM(prompt: IPrompt, onToken: (token: string) => void, toolDefinitions: any[], signal?: AbortSignal): Promise<ChatMessage | null> {
        return await this.config.llmProviderForChat!.queryStream(
            prompt,
            onToken,
            toolDefinitions.length > 0 ? toolDefinitions : undefined,
            signal
        );
    }

    /**
     * Checks if the response contains tool calls that need processing.
     */
    private shouldProcessToolCalls(response: ChatMessage): boolean {
        return !!(response.tool_calls && response.tool_calls.length > 0);
    }

    /**
     * Iterates over tool calls and executes them.
     */
    private async processToolCalls(toolCalls: ToolCall[]): Promise<void> {
        this.log(`Assistant requested ${toolCalls.length} tool calls.`);

        for (const toolCall of toolCalls) {
            await this.executeTool(toolCall);
        }
    }

    /**
     * Executes a single tool and records the result.
     */
    private async executeTool(toolCall: ToolCall): Promise<void> {
        const tool = this.tools.find(t => t.definition.name === toolCall.function.name);
        if (tool) {
            await this.runTool(tool, toolCall);
        } else {
            this.handleToolNotFound(toolCall);
        }
    }

    /**
     * Runs the tool logic and handles execution errors.
     */
    private async runTool(tool: ToolImplementation, toolCall: ToolCall): Promise<void> {
        this.log(`Executing tool: ${toolCall.function.name}`);
        try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await tool.execute(args);
            this.recordToolResult(toolCall.id, result);
        } catch (e: any) {
            this.handleToolError(toolCall.id, e);
        }
    }

    /**
     * Handles the case where a requested tool is not found.
     */
    private handleToolNotFound(toolCall: ToolCall): void {
        this.log(`Tool not found: ${toolCall.function.name}`);
        this.recordToolResult(toolCall.id, `Error: Tool ${toolCall.function.name} not found.`);
    }

    /**
     * Handles errors that occur during tool execution.
     */
    private handleToolError(toolCallId: string, error: any): void {
        this.log(`Error executing tool: ${error.message}`);
        this.recordToolResult(toolCallId, `Error: ${error.message}`);
    }

    /**
     * Adds the tool execution result (or error) to the chat history.
     */
    private recordToolResult(toolCallId: string, content: string): void {
        this.chatHistoryManager.addMessage({
            role: 'tool',
            content: content,
            tool_call_id: toolCallId
        });
    }

    /**
     * Creates a prompt for the follow-up query after tool execution.
     */
    private createFollowUpPrompt(): IPrompt {
        return {
            generateChatHistory: () => this.chatHistoryManager.getChatHistory()
        };
    }
}
