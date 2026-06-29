import { IToolImplementation, IConfigContainer } from "../types.js";
import type { IChatHistoryManager, IPrompt, IChatMessage, ToolCall, IChatAgent } from "../types.js";
import { IEventBus } from "../utils/eventBus.js";
import { APP_EVENTS } from "../constants/protocol.js";
import { createEventLogger } from "../log/eventLogger.js";
import { AGENT_MESSAGES, AGENT_LOGS } from "../constants/messages.js";
import { ChatPrompt } from "../chat/chatPrompt.js";
import { adaptiveMiddleTruncate } from "../utils/textUtils.js";

/**
 * Arguments for the Agent constructor.
 */
export interface IAgentArgs {
    /** The configuration container for the agent. */
    configContainer: IConfigContainer;
    /** The chat history manager for the agent. */
    chatHistoryManager: IChatHistoryManager;
    /** The tools available to the agent. */
    tools?: IToolImplementation<any>[];
    /** The event bus for the agent to emit events. */
    eventBus: IEventBus;
}

export class Agent implements IChatAgent {
    private configContainer: IConfigContainer;
    private chatHistoryManager: IChatHistoryManager;
    private tools: IToolImplementation<any>[];
    private eventBus: IEventBus;

    private logger: ReturnType<typeof createEventLogger>;

    constructor({
        configContainer,
        chatHistoryManager,
        tools = [],
        eventBus
    }: IAgentArgs) {
        this.configContainer = configContainer;
        this.chatHistoryManager = chatHistoryManager;
        this.tools = tools;
        this.eventBus = eventBus;
        this.logger = createEventLogger(eventBus);
    }

    async run(prompt: IPrompt, signal?: AbortSignal): Promise<void> {
        const toolDefinitions = this.tools.map(t => t.definition);
        let currentPrompt = prompt;
        let iterations = 0;
        const maxIterations = this.configContainer.config.maxAgentIterations;

        while (iterations < maxIterations) {
            if (signal?.aborted) {
                return;
            }
            iterations++;
            this.logger.info(AGENT_LOGS.ITERATION_START(iterations, maxIterations));

            const responses: IChatMessage[] = await this.queryLLM(currentPrompt, toolDefinitions, signal);

            if (responses.length === 0) {
                this.logger.warn(AGENT_LOGS.NO_RESPONSE_RECEIVED);
                break;
            }

            this.logger.debug(AGENT_LOGS.RESPONSE_RECEIVED);
            
            let hasToolCalls = false;
            for (const response of responses) {
                this.chatHistoryManager.addMessage(response);
                if (this.shouldProcessToolCalls(response)) {
                    this.logger.info(AGENT_LOGS.TOOL_CALLS_RECEIVED(response.tool_calls!.length));
                    await this.processToolCalls(response.tool_calls!, signal);
                    hasToolCalls = true;
                }
            }

            if (hasToolCalls) {
                // After tool results are added, we need to query the LLM again to get the final answer.
                // We create a new prompt with the updated history.
                currentPrompt = this.createFollowUpPrompt(currentPrompt.context);
                this.logger.info(AGENT_MESSAGES.REQUERYING_LLM);
                continue;
            }

            const totalContentLength = responses.reduce((acc, r) => acc + (r.content?.length || 0), 0);
            this.logger.debug(AGENT_LOGS.TEXT_RESPONSE_RECEIVED(totalContentLength));
            // No tool calls, we are done.
            break;
        }

        if (iterations >= maxIterations) {
            this.eventBus?.emit(APP_EVENTS.AGENT_MAX_ITERATIONS_REACHED, { maxIterations });
        }
        this.logger.info(AGENT_LOGS.AGENT_FINISHED);
    }

    /**
     * Queries the LLM provider for a response.
     */
    private async queryLLM(prompt: IPrompt, toolDefinitions: any[], signal?: AbortSignal): Promise<IChatMessage[]> {
        return await this.configContainer.config.llmProviderForChat!.queryStream(
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
        
        this.eventBus.emit(APP_EVENTS.AGENT_TOOL_START, {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            args: toolCall.function.arguments,
        });

        try {
            const parsedArgs = JSON.parse(toolCall.function.arguments);
            const validationResult = tool.schema.safeParse(parsedArgs);
            if (!validationResult.success) {
                const errorDetails = validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
                const errorMessage = `Invalid arguments for tool '${toolCall.function.name}': ${errorDetails}. Please correct the arguments and try again.`;
                this.recordToolResult(toolCall.id, toolCall.function.name, errorMessage, false);
                return;
            }
            // Use the validated/transformed data
            const validatedArgs = validationResult.data;

            const { content, success } = await tool.execute(validatedArgs, signal, toolCall.id);
            this.recordToolResult(toolCall.id, toolCall.function.name, content, success);
        } catch (e: any) {
            this.handleToolError(toolCall.id, toolCall.function.name, e);
        }
    }

    /**
     * Handles the case where a requested tool is not found.
     */
    private handleToolNotFound(toolCall: ToolCall): void {
        this.logger.error(AGENT_LOGS.TOOL_NOT_FOUND(toolCall.function.name));
        this.eventBus.emit(APP_EVENTS.AGENT_TOOL_START, {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            args: toolCall.function.arguments
        });
        this.recordToolResult(toolCall.id, toolCall.function.name, AGENT_MESSAGES.ERROR_TOOL_NOT_FOUND(toolCall.function.name), false);
    }

    /**
     * Handles errors that occur during tool execution.
     */
    private handleToolError(toolCallId: string, toolName: string, error: any): void {
        this.logger.error(AGENT_LOGS.TOOL_ERROR(error.message));
        this.recordToolResult(toolCallId, toolName, AGENT_MESSAGES.ERROR_TOOL_EXECUTION(error.message), false);
    }

    /**
     * Adds the tool execution result (or error) to the chat history.
     */
    private recordToolResult(toolCallId: string, toolName: string, content: string, success: boolean): void {
        const truncatedContent = adaptiveMiddleTruncate(content, this.configContainer.config.toolResultMaxLength);
        this.logger.debug(AGENT_LOGS.TOOL_RESULT_RECORDED(toolCallId));
        this.eventBus.emit(APP_EVENTS.AGENT_TOOL_END, {
            toolCallId: toolCallId,
            toolName: toolName,
            result: truncatedContent,
            success: success
        });
        this.chatHistoryManager.addMessage({
            role: 'tool',
            content: truncatedContent,
            tool_call_id: toolCallId,
            metadata: { toolCallSuccess: success }
        });
    }

    /**
     * Creates a prompt for the follow-up query after tool execution.
     */
    private createFollowUpPrompt(context?: string): IPrompt {
        return new ChatPrompt(this.chatHistoryManager.getChatHistory(), context);
    }
}