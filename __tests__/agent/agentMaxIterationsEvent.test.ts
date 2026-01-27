import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, ChatMessage, IPrompt, ToolImplementation, ToolCall, Config } from "../../src/types.js";
import { EventBus } from "../../src/utils/eventBus.js";

describe("Agent Max Iterations Event", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatMessage[];
    let mockPrompt: IPrompt;
    let eventBus: EventBus;

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
        eventBus = new EventBus();
    });

    it("emits agent:maxIterationsReached when limit is hit", async () => {
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
            maxAgentIterations: 2 
        };

        const agent = new Agent(
            config,
            logger,
            mockChatHistoryManager,
            [mockTool],
            eventBus
        );

        const eventSpy = jest.fn();
        eventBus.on('agent:maxIterationsReached', eventSpy);

        await agent.run(mockPrompt, () => {});

        expect(provider.queryStream).toHaveBeenCalledTimes(2);
        expect(eventSpy).toHaveBeenCalledWith({ maxIterations: 2 });
    });

    it("does NOT emit agent:maxIterationsReached when finished before limit", async () => {
        // Returns null to stop
        const provider = {
             queryStream: jest.fn(async (_prompt: any, _onToken: any, _tools: any) => {
                 return null;
             })
        } as any;

        const config: Config = {
            activeProvider: "test",
            providers: {},
            anonymizer: { enabled: false, words: [] },
            llmProviderForChat: provider,
            maxAgentIterations: 5 
        };

        const agent = new Agent(
            config,
            logger,
            mockChatHistoryManager,
            [],
            eventBus
        );

        const eventSpy = jest.fn();
        eventBus.on('agent:maxIterationsReached', eventSpy);

        await agent.run(mockPrompt, () => {});

        expect(eventSpy).not.toHaveBeenCalled();
    });
});
