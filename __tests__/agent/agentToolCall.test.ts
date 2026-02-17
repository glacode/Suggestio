import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, IChatMessage, IPrompt, ChatHistory, ToolImplementation, ToolCall, IEventBus } from "../../src/types.js";
import { FakeProvider, createDefaultConfig, createMockProviderConfig, createMockEventBus } from "../testUtils.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";

describe("ChatResponder Tool Calling Integration", () => {
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatHistory;
    let mockPrompt: IPrompt;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        mockChatHistory = [];
        mockChatHistoryManager = {
            clearHistory: jest.fn(() => {
                mockChatHistory.length = 0;
            }),
            addMessage: jest.fn((message: IChatMessage) => {
                mockChatHistory.push(message);
            }),
            getChatHistory: jest.fn(() => mockChatHistory),
        };
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'What time is it?' }],
        };
        mockEventBus = createMockEventBus();
    });

    it("processes tool calls and recurses (Integration Smoke Test)", async () => {
        const toolCall: ToolCall = {
            id: "call_123",
            type: "function",
            function: {
                name: "getTime",
                arguments: "{}"
            }
        };

        const toolResponse: IChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const finalResponse: IChatMessage = {
            role: "assistant",
            content: "It is 12:00 PM"
        };

        const provider = new FakeProvider([toolResponse, finalResponse], mockEventBus);

        const mockTool: ToolImplementation = {
            definition: {
                name: "getTime",
                description: "Gets the current time",
                parameters: { type: "object", properties: {} }
            },
            execute: jest.fn(async () => "12:00 PM")
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

        let streamedContent = "";
        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:token') {
                streamedContent += payload.token;
            }
        });

        await agent.run(mockPrompt);

        // Verify final output
        expect(streamedContent).toBe("It is 12:00 PM");

        // Verify tool execution
        expect(mockTool.execute).toHaveBeenCalled();
        expect(mockEventBus.emit).toHaveBeenCalledWith('log', expect.objectContaining({
            level: 'info',
            message: expect.stringContaining("Executing tool: getTime")
        }));
        expect(mockEventBus.emit).toHaveBeenCalledWith('log', expect.objectContaining({
            level: 'info',
            message: AGENT_MESSAGES.REQUERYING_LLM
        }));

        // Verify history updates
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledTimes(3);
        
        expect(mockChatHistory[0]).toEqual(expect.objectContaining({ role: "assistant", content: "" }));
        expect(mockChatHistory[1]).toEqual({
            role: "tool",
            content: "12:00 PM",
            tool_call_id: "call_123"
        });
        expect(mockChatHistory[2]).toEqual(expect.objectContaining({ role: "assistant", content: "It is 12:00 PM" }));
    });
});
