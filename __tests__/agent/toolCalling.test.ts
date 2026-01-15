import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { ChatResponder } from "../../src/chat/chatResponder.js";
import { IChatHistoryManager, ChatMessage, IPrompt, ILlmProvider, ToolImplementation } from "../../src/types.js";

class ToolCallingProvider implements ILlmProvider {
    private step = 0;
    constructor(private toolName: string, private toolArgs: string, private finalReply: string) {}

    async query(): Promise<ChatMessage | null> { return null; }

    async queryStream(_prompt: IPrompt, onToken: (token: string) => void): Promise<ChatMessage | null> {
        if (this.step === 0) {
            this.step++;
            return {
                role: "assistant",
                content: "I will list the files.",
                tool_calls: [{
                    id: "call_1",
                    type: "function",
                    function: { name: this.toolName, arguments: this.toolArgs }
                }]
            };
        } else {
            onToken(this.finalReply);
            return { role: "assistant", content: this.finalReply };
        }
    }
}

describe("ChatResponder Tool Calling", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatMessage[];

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
        mockChatHistory = [];
        mockChatHistoryManager = {
            clearHistory: jest.fn(),
            addMessage: jest.fn((msg: ChatMessage) => { mockChatHistory.push(msg); }),
            getChatHistory: jest.fn(() => mockChatHistory),
        };
    });

    it("should execute a tool and re-query the LLM", async () => {
        const mockTool: ToolImplementation = {
            definition: {
                name: "test_tool",
                description: "A test tool",
                parameters: { type: "object", properties: {} }
            },
            execute: jest.fn(async () => "Tool Result")
        };

        const provider = new ToolCallingProvider("test_tool", "{}", "Final Answer");
        const handler = new ChatResponder(
            { activeProvider: "FAKE", llmProviderForChat: provider } as any,
            logger,
            mockChatHistoryManager,
            [mockTool]
        );

        const onToken = jest.fn();
        await handler.fetchStreamChatResponse({ generateChatHistory: () => [] }, onToken);

        expect(mockTool.execute).toHaveBeenCalled();
        expect(onToken).toHaveBeenCalledWith("Final Answer");
        expect(mockChatHistory).toContainEqual(expect.objectContaining({ role: "tool", content: "Tool Result" }));
        expect(mockChatHistory).toContainEqual(expect.objectContaining({ role: "assistant", content: "Final Answer" }));
    });
});
