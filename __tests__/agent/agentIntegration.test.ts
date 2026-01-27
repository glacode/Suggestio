import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, ChatMessage, IPrompt, ChatHistory, Config, IProviderConfig, ILlmProvider, ToolDefinition } from "../../src/types.js"; // Import ChatMessage from types.js

// Define a minimal mock config interface for testing purposes
interface MockConfig extends Pick<Config, 'activeProvider' | 'llmProviderForChat' | 'providers' | 'anonymizer'> { }

class FakeProvider implements ILlmProvider {
    constructor(private reply: string | null, private shouldThrow = false) { }

    async query(_prompt: IPrompt, _tools?: ToolDefinition[]): Promise<ChatMessage | null> {
        if (this.shouldThrow) { throw new Error("Simulated failure"); }
        if (this.reply === null) { return null; }
        return { role: "assistant", content: this.reply };
    }

    async queryStream(_prompt: IPrompt, onToken: (token: string) => void, _tools?: ToolDefinition[]): Promise<ChatMessage | null> {
        if (this.shouldThrow) { throw new Error("Simulated failure"); }
        if (this.reply) {
            onToken(this.reply);
        }
        if (this.reply === null) { return null; }
        return { role: "assistant", content: this.reply };
    }
}

describe("Agent (Integration) simple tests", () => {
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
                mockChatHistory.length = 0; // Clear the array
            }),
            addMessage: jest.fn((message: ChatMessage) => {
                mockChatHistory.push(message);
            }),
            getChatHistory: jest.fn(() => mockChatHistory),
        };
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'Hi' }],
        };
    });

    it("fetches stream chat response on success", async () => {
        const handler = new Agent(
            {
                activeProvider: "FAKE",
                llmProviderForChat: new FakeProvider("Hello world"),
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            mockChatHistoryManager // Injected mock
        );

        let streamedContent = "";
        const onToken = (token: string) => {
            streamedContent += token;
        };

        await handler.run(mockPrompt, onToken);
        expect(streamedContent).toBe("Hello world");
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledTimes(1);
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledWith({ role: "assistant", content: "Hello world" });
        expect(mockChatHistory.length).toBe(1);
    });

    it("handles error when fetching stream chat response", async () => {
        const handler = new Agent(
            {
                activeProvider: "FAKE",
                llmProviderForChat: new FakeProvider(null, true),
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            mockChatHistoryManager // Injected mock
        );

        let streamedContent = "";
        const onToken = (token: string) => {
            streamedContent += token;
        };

        await expect(handler.run(mockPrompt, onToken)).rejects.toThrow("Simulated failure");
        expect(streamedContent).toBe("");
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledTimes(0);
        expect(mockChatHistory.length).toBe(0);
    });

    it("clears conversation history via ChatHistoryManager", () => {
        mockChatHistoryManager.addMessage({ role: "user", content: "Test message" });
        expect(mockChatHistoryManager.getChatHistory().length).toBe(1);

        mockChatHistoryManager.clearHistory(); // Call clearHistory through the manager directly
        expect(mockChatHistoryManager.getChatHistory().length).toBe(0);
        expect(mockChatHistoryManager.clearHistory).toHaveBeenCalledTimes(1);
    });
});
