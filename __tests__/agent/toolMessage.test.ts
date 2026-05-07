import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, IChatMessage, IPrompt, IStoredChatMessage, IToolImplementation, ToolCall, IEventBus } from "../../src/types.js";
import { FakeProvider, createDefaultConfig, createMockProfileConfig, createMockEventBus } from "../testUtils.js";
import { z } from "zod";

describe("Agent Tool Message Formatting", () => {
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: IStoredChatMessage[];
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

    it("emits raw tool info without formatting", async () => {
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
            schema: z.any(),
            execute: jest.fn(async () => ({ content: "result", success: true }))
        };

        const agent = new Agent({
            config: createDefaultConfig({
                activeChatProfile: "FAKE",
                llmProviderForChat: provider,
                profiles: { FAKE: createMockProfileConfig() },
            }),
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        expect(mockTool.formatMessage).not.toHaveBeenCalled();
        expect(mockEventBus.emit).toHaveBeenCalledWith('agent:toolStart', {
            toolCallId: "call_1",
            toolName: "customTool",
            args: JSON.stringify({ arg1: "value1" })
        });
    });

    it("emits toolStart for tools without formatMessage", async () => {
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
            schema: z.any(),
            execute: jest.fn(async () => ({ content: "result", success: true }))
        };

        const agent = new Agent({
            config: createDefaultConfig({
                activeChatProfile: "FAKE",
                llmProviderForChat: provider,
                profiles: { FAKE: createMockProfileConfig() },
            }),
            chatHistoryManager: mockChatHistoryManager,
            tools: [mockTool],
            eventBus: mockEventBus
        });

        await agent.run(mockPrompt);

        expect(mockEventBus.emit).toHaveBeenCalledWith('agent:toolStart', {
            toolCallId: "call_2",
            toolName: "fallbackTool",
            args: "{}"
        });
    });
});
