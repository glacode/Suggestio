import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, IChatMessage, IPrompt, ChatHistory, IToolImplementation, ToolCall, IEventBus } from "../../src/types.js";
import { FakeProvider, createDefaultConfig, createMockProviderConfig, createMockEventBus } from "../testUtils.js";

describe("Agent Tool Message Formatting", () => {
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatHistory;
    let mockPrompt: IPrompt;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        mockChatHistory = [];
        mockChatHistoryManager = {
            clearHistory: jest.fn(),
            addMessage: jest.fn((message: IChatMessage) => {
                mockChatHistory.push(message);
            }),
            getChatHistory: jest.fn(() => mockChatHistory),
        };
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'test' }],
        };
        mockEventBus = createMockEventBus();
    });

    it("uses custom formatMessage when available", async () => {
        const toolCall: ToolCall = {
            id: "call_1",
            type: "function",
            function: {
                name: "customTool",
                arguments: JSON.stringify({ arg1: "value1" })
            }
        };

        const assistantResponse: IChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const provider = new FakeProvider([assistantResponse, { role: "assistant", content: "done" }], mockEventBus);

        const mockTool: IToolImplementation = {
            definition: {
                name: "customTool",
                description: "A tool with custom message",
                parameters: { type: "object", properties: { arg1: { type: "string" } } }
            },
            formatMessage: jest.fn((args: any) => `Custom message for ${args.arg1}`),
            execute: jest.fn(async () => "result")
        };

        const agent = new Agent({
            config: createDefaultConfig({
                activeProvider: "FAKE",
                llmProviderForChat: provider,
                providers: { FAKE: createMockProviderConfig() },
            }),
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        expect(mockTool.formatMessage).toHaveBeenCalledWith({ arg1: "value1" });
        expect(mockEventBus.emit).toHaveBeenCalledWith('agent:toolStart', expect.objectContaining({
            toolName: "customTool",
            displayMessage: "Custom message for value1"
        }));
    });

    it("falls back to undefined displayMessage when formatMessage is not provided", async () => {
        const toolCall: ToolCall = {
            id: "call_2",
            type: "function",
            function: {
                name: "fallbackTool",
                arguments: "{}"
            }
        };

        const assistantResponse: IChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const provider = new FakeProvider([assistantResponse, { role: "assistant", content: "done" }], mockEventBus);

        const mockTool: IToolImplementation = {
            definition: {
                name: "fallbackTool",
                description: "A tool without custom message",
                parameters: { type: "object", properties: {} }
            },
            execute: jest.fn(async () => "result")
        };

        const agent = new Agent({
            config: createDefaultConfig({
                activeProvider: "FAKE",
                llmProviderForChat: provider,
                providers: { FAKE: createMockProviderConfig() },
            }),
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        expect(mockEventBus.emit).toHaveBeenCalledWith('agent:toolStart', expect.objectContaining({
            toolName: "fallbackTool",
            displayMessage: undefined
        }));
    });
});
