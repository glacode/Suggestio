import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, ChatMessage, IPrompt, ToolImplementation, ToolCall, Config } from "../../src/types.js";

describe("Agent Max Iterations", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatMessage[];
    let mockPrompt: IPrompt;

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
        mockChatHistory = [];
        mockChatHistoryManager = {
            clearHistory: jest.fn(() => { mockChatHistory.length = 0; }),
            addMessage: jest.fn((message: ChatMessage) => { mockChatHistory.push(message); }),
            getChatHistory: jest.fn(() => mockChatHistory),
        };
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'Hi' }],
        };
    });

    it("respects maxAgentIterations config", async () => {
        // Create a provider that always returns tool calls, potentially infinite loop
        const toolCall: ToolCall = {
            id: "call_loop",
            type: "function",
            function: { name: "loop_tool", arguments: "{}" }
        };
        const response: ChatMessage = {
            role: "assistant",
            content: "Looping...",
            tool_calls: [toolCall]
        };

        // Infinite stream of responses
        const provider = {
             queryStream: jest.fn(async (_prompt: any, onToken: any, _tools: any) => {
                 onToken("Looping...");
                 return response;
             })
        } as any;

        const mockTool: ToolImplementation = {
            definition: { name: "loop_tool", description: "Loop", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Loop Result")
        };

        const config: Config = {
            activeProvider: "test",
            providers: {},
            anonymizer: { enabled: false, words: [] },
            llmProviderForChat: provider,
            maxAgentIterations: 3 // Limit to 3 iterations
        };

        const agent = new Agent(
            config,
            logger,
            mockChatHistoryManager,
            [mockTool]
        );

        await agent.run(mockPrompt, () => {});

        // It should run exactly 3 times
        expect(provider.queryStream).toHaveBeenCalledTimes(3);
    });

    it("defaults to 5 iterations if config is missing", async () => {
         // Create a provider that always returns tool calls
         const toolCall: ToolCall = {
            id: "call_loop",
            type: "function",
            function: { name: "loop_tool", arguments: "{}" }
        };
        const response: ChatMessage = {
            role: "assistant",
            content: "Looping...",
            tool_calls: [toolCall]
        };

        const provider = {
             queryStream: jest.fn(async (_prompt: any, onToken: any, _tools: any) => {
                 onToken("Looping...");
                 return response;
             })
        } as any;

        const mockTool: ToolImplementation = {
            definition: { name: "loop_tool", description: "Loop", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Loop Result")
        };

        const config: Config = {
            activeProvider: "test",
            providers: {},
            anonymizer: { enabled: false, words: [] },
            llmProviderForChat: provider,
            // maxAgentIterations missing
        };

        const agent = new Agent(
            config,
            logger,
            mockChatHistoryManager,
            [mockTool]
        );

        await agent.run(mockPrompt, () => {});

        // It should run exactly 5 times (default)
        expect(provider.queryStream).toHaveBeenCalledTimes(5);
    });
});
