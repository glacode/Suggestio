import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { ChatResponder } from "../../src/chat/chatResponder.js";
import { IChatHistoryManager, ChatMessage, IPrompt, ChatHistory, Config, IProviderConfig, ILlmProvider, ToolDefinition, ToolImplementation, ToolCall } from "../../src/types.js";

interface MockConfig extends Pick<Config, 'activeProvider' | 'llmProviderForChat' | 'providers' | 'anonymizer'> { }

class SequentialFakeProvider implements ILlmProvider {
    private callCount = 0;
    constructor(private responses: (ChatMessage | null)[]) { }

    async query(_prompt: IPrompt, _tools?: ToolDefinition[]): Promise<ChatMessage | null> {
        return this.getNextResponse();
    }

    async queryStream(_prompt: IPrompt, onToken: (token: string) => void, _tools?: ToolDefinition[]): Promise<ChatMessage | null> {
        const response = this.getNextResponse();
        if (response && response.content) {
            onToken(response.content);
        }
        return response;
    }

    private getNextResponse(): ChatMessage | null {
        if (this.callCount < this.responses.length) {
            return this.responses[this.callCount++];
        }
        return null;
    }
}

describe("ChatResponder Tool Calling", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatHistory;
    let mockPrompt: IPrompt;

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
        mockChatHistory = [];
        mockChatHistoryManager = {
            clearHistory: jest.fn(() => {
                mockChatHistory.length = 0;
            }),
            addMessage: jest.fn((message: ChatMessage) => {
                mockChatHistory.push(message);
            }),
            getChatHistory: jest.fn(() => mockChatHistory),
        };
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'What time is it?' }],
        };
    });

    it("processes tool calls and recurses", async () => {
        const toolCall: ToolCall = {
            id: "call_123",
            type: "function",
            function: {
                name: "getTime",
                arguments: "{}"
            }
        };

        const toolResponse: ChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "It is 12:00 PM"
        };

        const provider = new SequentialFakeProvider([toolResponse, finalResponse]);

        const mockTool: ToolImplementation = {
            definition: {
                name: "getTime",
                description: "Gets the current time",
                parameters: { type: "object", properties: {} }
            },
            execute: jest.fn(async () => "12:00 PM")
        };

        const handler = new ChatResponder(
            {
                activeProvider: "FAKE",
                llmProviderForChat: provider,
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            mockChatHistoryManager,
            [mockTool]
        );

        let streamedContent = "";
        const onToken = (token: string) => {
            streamedContent += token;
        };

        await handler.fetchStreamChatResponse(mockPrompt, onToken);

        // Verify final output
        expect(streamedContent).toBe("It is 12:00 PM");

        // Verify tool execution
        expect(mockTool.execute).toHaveBeenCalled();
        expect(logs).toContain("Executing tool: getTime");
        expect(logs).toContain("Re-querying LLM with tool results...");

        // Verify history updates
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledTimes(3);
        
        expect(mockChatHistory[0]).toEqual(toolResponse);
        expect(mockChatHistory[1]).toEqual({
            role: "tool",
            content: "12:00 PM",
            tool_call_id: "call_123"
        });
        expect(mockChatHistory[2]).toEqual(finalResponse);
    });

    it("handles tool not found", async () => {
        const toolCall: ToolCall = {
            id: "call_456",
            type: "function",
            function: {
                name: "unknownTool",
                arguments: "{}"
            }
        };

        const toolResponse: ChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "I could not find the tool."
        };

        const provider = new SequentialFakeProvider([toolResponse, finalResponse]);

        const handler = new ChatResponder(
            {
                activeProvider: "FAKE",
                llmProviderForChat: provider,
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            mockChatHistoryManager,
            [] // No tools
        );

        await handler.fetchStreamChatResponse(mockPrompt, () => {});

        expect(logs).toContain("Tool not found: unknownTool");
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
            role: "tool",
            content: expect.stringContaining("Error: Tool unknownTool not found"),
            tool_call_id: "call_456"
        }));
    });

    it("handles tool execution error", async () => {
        const toolCall: ToolCall = {
            id: "call_789",
            type: "function",
            function: {
                name: "errorTool",
                arguments: "{}"
            }
        };

        const toolResponse: ChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall]
        };

        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "Something went wrong."
        };

        const provider = new SequentialFakeProvider([toolResponse, finalResponse]);

        const mockTool: ToolImplementation = {
            definition: {
                name: "errorTool",
                description: "Throws an error",
                parameters: { type: "object", properties: {} }
            },
            execute: jest.fn(async () => { throw new Error("Tool failed"); })
        };

        const handler = new ChatResponder(
            {
                activeProvider: "FAKE",
                llmProviderForChat: provider,
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            mockChatHistoryManager,
            [mockTool]
        );

        await handler.fetchStreamChatResponse(mockPrompt, () => {});

        expect(logs).toContain("Error executing tool: Tool failed");
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
            role: "tool",
            content: "Error: Tool failed",
            tool_call_id: "call_789"
        }));
    });

    it("processes multiple tool calls in a single response", async () => {
        const toolCall1: ToolCall = {
            id: "call_A",
            type: "function",
            function: {
                name: "toolA",
                arguments: JSON.stringify({ arg: "valA" })
            }
        };

        const toolCall2: ToolCall = {
            id: "call_B",
            type: "function",
            function: {
                name: "toolB",
                arguments: JSON.stringify({ arg: "valB" })
            }
        };

        const toolResponse: ChatMessage = {
            role: "assistant",
            content: "",
            tool_calls: [toolCall1, toolCall2]
        };

        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "Processed both."
        };

        const provider = new SequentialFakeProvider([toolResponse, finalResponse]);

        const mockToolA: ToolImplementation = {
            definition: { name: "toolA", description: "Tool A", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result A")
        };

        const mockToolB: ToolImplementation = {
            definition: { name: "toolB", description: "Tool B", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result B")
        };

        const handler = new ChatResponder(
            {
                activeProvider: "FAKE",
                llmProviderForChat: provider,
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            mockChatHistoryManager,
            [mockToolA, mockToolB]
        );

        let streamedContent = "";
        await handler.fetchStreamChatResponse(mockPrompt, (token) => { streamedContent += token; });

        expect(streamedContent).toBe("Processed both.");
        expect(mockToolA.execute).toHaveBeenCalledWith({ arg: "valA" });
        expect(mockToolB.execute).toHaveBeenCalledWith({ arg: "valB" });

        // Verify history: 
        // 1. Assistant message with 2 tool calls
        // 2. Tool result A
        // 3. Tool result B
        // 4. Final assistant response
        expect(mockChatHistory.length).toBe(4);
        expect(mockChatHistory[0]).toEqual(toolResponse);
        expect(mockChatHistory[1]).toEqual({
            role: "tool",
            content: "Result A",
            tool_call_id: "call_A"
        });
        expect(mockChatHistory[2]).toEqual({
            role: "tool",
            content: "Result B",
            tool_call_id: "call_B"
        });
        expect(mockChatHistory[3]).toEqual(finalResponse);
    });

    it("handles multiple consecutive iterations of tool calls", async () => {
        // Round 1: Assistant requests tool 1
        const toolCall1: ToolCall = {
            id: "call_1",
            type: "function",
            function: { name: "tool1", arguments: "{}" }
        };
        const response1: ChatMessage = {
            role: "assistant",
            content: "Step 1",
            tool_calls: [toolCall1]
        };

        // Round 2: Assistant requests tool 2
        const toolCall2: ToolCall = {
            id: "call_2",
            type: "function",
            function: { name: "tool2", arguments: "{}" }
        };
        const response2: ChatMessage = {
            role: "assistant",
            content: "Step 2",
            tool_calls: [toolCall2]
        };

        // Round 3: Final response
        const finalResponse: ChatMessage = {
            role: "assistant",
            content: "Done."
        };

        const provider = new SequentialFakeProvider([response1, response2, finalResponse]);

        const mockTool1: ToolImplementation = {
            definition: { name: "tool1", description: "Tool 1", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result 1")
        };

        const mockTool2: ToolImplementation = {
            definition: { name: "tool2", description: "Tool 2", parameters: { type: "object", properties: {} } },
            execute: jest.fn(async () => "Result 2")
        };

        const handler = new ChatResponder(
            {
                activeProvider: "FAKE",
                llmProviderForChat: provider,
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            mockChatHistoryManager,
            [mockTool1, mockTool2]
        );

        let streamedContent = "";
        await handler.fetchStreamChatResponse(mockPrompt, (token) => { streamedContent += token; });

        expect(streamedContent).toBe("Step 1Step 2Done.");
        expect(mockTool1.execute).toHaveBeenCalled();
        expect(mockTool2.execute).toHaveBeenCalled();
        
        // Verify flow:
        // 1. Assistant (Tool 1)
        // 2. Tool Result 1
        // 3. Assistant (Tool 2)
        // 4. Tool Result 2
        // 5. Final Assistant
        expect(mockChatHistory.length).toBe(5);
        
        expect(mockChatHistory[0]).toEqual(response1);
        expect(mockChatHistory[1]).toEqual({
            role: "tool",
            content: "Result 1",
            tool_call_id: "call_1"
        });

        expect(mockChatHistory[2]).toEqual(response2);
        expect(mockChatHistory[3]).toEqual({
            role: "tool",
            content: "Result 2",
            tool_call_id: "call_2"
        });

        expect(mockChatHistory[4]).toEqual(finalResponse);
    });
});
