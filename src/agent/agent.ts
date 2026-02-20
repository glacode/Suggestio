import { Config, IToolImplementation } from "../types.js";
import type { IChatHistoryManager, IPrompt, IChatMessage, ToolCall, IChatAgent } from "../types.js";
import { IEventBus } from "../utils/eventBus.js";
import { createEventLogger } from "../log/eventLogger.js";
import { AGENT_MESSAGES, AGENT_LOGS } from "../constants/messages.js";
import { ChatPrompt } from "../chat/chatPrompt.js";

/**
 * Arguments for the Agent constructor.
 */
export interface IAgentArgs {
    /** The configuration for the agent. */
    config: Config;
    /** The chat history manager for the agent. */
    chatHistoryManager: IChatHistoryManager;
    /** The tools available to the agent. */
    tools?: IToolImplementation[];
    /** The event bus for the agent to emit events. */
    eventBus: IEventBus;
}

export class Agent implements IChatAgent {
    private config: Config;
    private chatHistoryManager: IChatHistoryManager;
    private tools: IToolImplementation[];
    private eventBus: IEventBus;

    private logger: ReturnType<typeof createEventLogger>;

    constructor({
        config,
        chatHistoryManager,
        tools = [],
        eventBus
    }: IAgentArgs) {
        this.config = config;
        this.chatHistoryManager = chatHistoryManager;
        this.tools = tools;
        this.eventBus = eventBus;
        this.logger = createEventLogger(eventBus);
    }

    async run(prompt: IPrompt, signal?: AbortSignal): Promise<void> {
        const toolDefinitions = this.tools.map(t => t.definition);
        let currentPrompt = prompt;
        let iterations = 0;
        const maxIterations = this.config.maxAgentIterations;

        while (iterations < maxIterations) {
            if (signal?.aborted) {
                return;
            }
            iterations++;
            this.logger.info(AGENT_LOGS.ITERATION_START(iterations, maxIterations));

            const response: IChatMessage | null = await this.queryLLM(currentPrompt, toolDefinitions, signal);

            if (!response) {
                this.logger.warn(AGENT_LOGS.NO_RESPONSE_RECEIVED);
                break;
            }

            this.logger.debug(AGENT_LOGS.RESPONSE_RECEIVED);
            this.chatHistoryManager.addMessage(response);

            if (this.shouldProcessToolCalls(response)) {
                this.logger.info(AGENT_LOGS.TOOL_CALLS_RECEIVED(response.tool_calls!.length));
                await this.processToolCalls(response.tool_calls!, signal);

                // After tool results are added, we need to query the LLM again to get the final answer.
                // We create a new prompt with the updated history.
                currentPrompt = this.createFollowUpPrompt(currentPrompt.context);
                this.logger.info(AGENT_MESSAGES.REQUERYING_LLM);
                continue;
            }

            this.logger.debug(AGENT_LOGS.TEXT_RESPONSE_RECEIVED(response.content?.length || 0));
            // No tool calls, we are done.
            break;
        }

        if (iterations >= maxIterations) {
            this.eventBus?.emit('agent:maxIterationsReached', { maxIterations });
        }
        this.logger.info(AGENT_LOGS.AGENT_FINISHED);
    }

    /**
     * Queries the LLM provider for a response.
     */
    private async queryLLM(prompt: IPrompt, toolDefinitions: any[], signal?: AbortSignal): Promise<IChatMessage | null> {
        return await this.config.llmProviderForChat!.queryStream(
            prompt,
            toolDefinitions.length > 0 ? toolDefinitions : undefined,
            signal
        );
    }

    /**
     * Checks if the response contains tool calls that need processing.
     */
    private shouldProcessToolCalls(response: IChatMessage): boolean {
        return !!(response.tool_calls && response.tool_calls.length > 0);
    }

    /**
     * Iterates over tool calls and executes them.
     */
    private async processToolCalls(toolCalls: ToolCall[], signal?: AbortSignal): Promise<void> {
        this.logger.debug(AGENT_LOGS.ASSISTANT_TOOL_CALLS(toolCalls.length));

        for (const toolCall of toolCalls) {
            if (signal?.aborted) {
                break;
            }
            await this.executeTool(toolCall, signal);
        }
    }

    /**
     * Executes a single tool and records the result.
     */
    private async executeTool(toolCall: ToolCall, signal?: AbortSignal): Promise<void> {
        const tool = this.tools.find(t => t.definition.name === toolCall.function.name);
        if (tool) {
            await this.runTool(tool, toolCall, signal);
        } else {
            this.handleToolNotFound(toolCall);
        }
    }

    /**
     * Runs the tool logic and handles execution errors.
     */
    private async runTool(tool: IToolImplementation, toolCall: ToolCall, signal?: AbortSignal): Promise<void> {
        this.logger.info(AGENT_LOGS.EXECUTING_TOOL(toolCall.function.name));
        try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await tool.execute(args, signal);
            this.recordToolResult(toolCall.id, result);
        } catch (e: any) {
            this.handleToolError(toolCall.id, e);
        }
    }

    /**
     * Handles the case where a requested tool is not found.
     */
    private handleToolNotFound(toolCall: ToolCall): void {
        this.logger.error(AGENT_LOGS.TOOL_NOT_FOUND(toolCall.function.name));
        this.recordToolResult(toolCall.id, AGENT_MESSAGES.ERROR_TOOL_NOT_FOUND(toolCall.function.name));
    }

    /**
     * Handles errors that occur during tool execution.
     */
    private handleToolError(toolCallId: string, error: any): void {
        this.logger.error(AGENT_LOGS.TOOL_ERROR(error.message));
        this.recordToolResult(toolCallId, AGENT_MESSAGES.ERROR_TOOL_EXECUTION(error.message));
    }

    /**
     * Adds the tool execution result (or error) to the chat history.
     */
    private recordToolResult(toolCallId: string, content: string): void {
        this.logger.debug(AGENT_LOGS.TOOL_RESULT_RECORDED(toolCallId));
        this.chatHistoryManager.addMessage({
            role: 'tool',
            content: content,
            tool_call_id: toolCallId
        });
    }

    /**
     * Creates a prompt for the follow-up query after tool execution.
     */
    private createFollowUpPrompt(context?: string): IPrompt {
        return new ChatPrompt(this.chatHistoryManager.getChatHistory(), context);
    }
}