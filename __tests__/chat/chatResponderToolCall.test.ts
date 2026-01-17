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
});
