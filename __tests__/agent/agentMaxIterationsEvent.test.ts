import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, IChatMessage, IPrompt, IToolImplementation, ToolCall, ILlmProvider } from "../../src/types.js";
import { EventBus } from "../../src/utils/eventBus.js";
import { CONFIG_DEFAULTS } from "../../src/constants/config.js";
import { createMockHistoryManager, createDefaultConfig } from "../testUtils.js";

describe("Agent Max Iterations Event", () => {
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: IChatMessage[];
    let mockPrompt: IPrompt;
    let eventBus: EventBus;

    beforeEach(() => {
        mockChatHistory = [];
        mockChatHistoryManager = createMockHistoryManager(mockChatHistory);
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'Hi' }],
        };
        eventBus = new EventBus();
    });

    it("emits agent:maxIterationsReached when limit is hit", async () => {
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
            llmProviderForChat: provider,
            maxAgentIterations: 2 
        });

        const agent = new Agent({
            config,
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus
        });

        const eventSpy = jest.fn();
        eventBus.on('agent:maxIterationsReached', eventSpy);

        await agent.run(mockPrompt);

        expect(provider.queryStream).toHaveBeenCalledTimes(2);
        expect(eventSpy).toHaveBeenCalledWith({ maxIterations: 2 });
    });

    it("does NOT emit agent:maxIterationsReached when finished before limit", async () => {
        // Returns null to stop
        const provider: jest.Mocked<ILlmProvider> = {
             query: jest.fn(),
             queryStream: jest.fn(async () => {
                 return null;
             })
        };

        const config = createDefaultConfig({
            llmProviderForChat: provider,
            maxAgentIterations: CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS
        });

        const agent = new Agent({
            config,
            chatHistoryManager: mockChatHistoryManager,
            tools: [],
            eventBus
        });

        const eventSpy = jest.fn();
        eventBus.on('agent:maxIterationsReached', eventSpy);

        await agent.run(mockPrompt);

        expect(eventSpy).not.toHaveBeenCalled();
    });
});