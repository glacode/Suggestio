import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, IChatMessage, IPrompt, IToolImplementation, ToolCall, ILlmProvider, IEventBus } from "../../src/types.js";
import { CONFIG_DEFAULTS } from "../../src/constants/config.js";
import { createMockHistoryManager, createDefaultConfig, createMockEventBus } from "../testUtils.js";

describe("Agent Max Iterations", () => {
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: IChatMessage[];
    let mockPrompt: IPrompt;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        mockChatHistory = [];
        mockChatHistoryManager = createMockHistoryManager(mockChatHistory);
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'Hi' }],
        };
        mockEventBus = createMockEventBus();
    });

    it("respects maxAgentIterations config", async () => {
        // Create a provider that always returns tool calls, potentially infinite loop
        const toolCall: ToolCall = {
            id: "call_loop",
            type: "function",
            function: { name: "loop_tool", arguments: "{}" }
        };
        const response: IChatMessage = {
            role: "assistant",
            content: "Looping...",
            tool_calls: [toolCall]
        };

        // Infinite stream of responses
        const provider: jest.Mocked<ILlmProvider> = {
             query: jest.fn(),
             queryStream: jest.fn(async () => {
                 return response;
             })
        };

        const mockTool: IToolImplementation = {
            definition: { name: "loop_tool", description: "Loop", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Loop Result")
        };

        const config = createDefaultConfig({
            llmProviderForChat: provider,
            maxAgentIterations: 3 // Limit to 3 iterations
        });

        const agent = new Agent({
            config,
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        // It should run exactly 3 times
        expect(provider.queryStream).toHaveBeenCalledTimes(3);
    });

    it("uses default iterations from CONFIG_DEFAULTS", async () => {
         // Create a provider that always returns tool calls
         const toolCall: ToolCall = {
            id: "call_loop",
            type: "function",
            function: { name: "loop_tool", arguments: "{}" }
        };
        const response: IChatMessage = {
            role: "assistant",
            content: "Looping...",
            tool_calls: [toolCall]
        };

        const provider: jest.Mocked<ILlmProvider> = {
             query: jest.fn(),
             queryStream: jest.fn(async () => {
                 return response;
             })
        };

        const mockTool: IToolImplementation = {
            definition: { name: "loop_tool", description: "Loop", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Loop Result")
        };

        const config = createDefaultConfig({
            llmProviderForChat: provider
        });

        const agent = new Agent({
            config,
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        // It should run exactly CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS times
        expect(provider.queryStream).toHaveBeenCalledTimes(CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS);
    });
});