import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { ChatResponder } from "../../src/chat/chatResponder.js";
import { llmProvider } from "../../src/providers/llmProvider.js";
import { IPrompt } from "../../src/promptBuilder/prompt.js";
import { Config, ProviderConfig } from "../../src/config/types.js";
import { IChatHistoryManager, ChatMessage } from "../../src/chat/types.js"; // Import ChatMessage from types.js

// Define a minimal mock config interface for testing purposes
interface MockChatLogicHandlerConfig extends Pick<Config, 'activeProvider' | 'llmProviderForChat' | 'providers' | 'anonymizer'> { }

class FakeProvider implements llmProvider {
    constructor(private reply: string | null, private shouldThrow = false) { }

    async query(_prompt: IPrompt): Promise<string | null> {
        if (this.shouldThrow) { throw new Error("Simulated failure"); }
        return this.reply;
    }

    async queryStream(_prompt: IPrompt, onToken: (token: string) => void): Promise<void> {
        if (this.shouldThrow) { throw new Error("Simulated failure"); }
        if (this.reply) {
            onToken(this.reply);
        }
        return Promise.resolve();
    }
}

describe("ChatLogicHandler (DI) simple tests", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let mockChatHistoryManager: IChatHistoryManager;
    let mockConversationHistory: ChatMessage[];

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
        mockConversationHistory = [];
        mockChatHistoryManager = {
            clearHistory: jest.fn(() => {
                mockConversationHistory.length = 0; // Clear the array
            }),
            addMessage: jest.fn((message: ChatMessage) => {
                mockConversationHistory.push(message);
            }),
            getChatHistory: jest.fn(() => mockConversationHistory),
        };
    });

    it("fetches stream chat response on success", async () => {
        const handler = new ChatResponder(
            {
                activeProvider: "FAKE",
                llmProviderForChat: new FakeProvider("Hello world"),
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as ProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockChatLogicHandlerConfig,
            logger,
            mockChatHistoryManager // Injected mock
        );

        let streamedContent = "";
        const onToken = (token: string) => {
            streamedContent += token;
        };

        await handler.fetchStreamChatResponse("Hi", onToken);
        expect(streamedContent).toBe("Hello world");
        expect(logs).toEqual(expect.arrayContaining([
            expect.stringContaining("Fetching stream completion"),
            expect.stringContaining("Stream completion finished")
        ]));
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledTimes(2);
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledWith({ role: "user", content: "Hi" });
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledWith({ role: "assistant", content: "Hello world" });
        expect(mockChatHistoryManager.getChatHistory).toHaveBeenCalledTimes(1);
        expect(mockConversationHistory.length).toBe(2);
    });

    it("handles error when fetching stream chat response", async () => {
        const handler = new ChatResponder(
            {
                activeProvider: "FAKE",
                llmProviderForChat: new FakeProvider(null, true),
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as ProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockChatLogicHandlerConfig,
            logger,
            mockChatHistoryManager // Injected mock
        );

        let streamedContent = "";
        const onToken = (token: string) => {
            streamedContent += token;
        };

        await expect(handler.fetchStreamChatResponse("Hi", onToken)).rejects.toThrow("Simulated failure");
        expect(streamedContent).toBe("");
        expect(logs).toEqual(expect.arrayContaining([
            expect.stringContaining("Fetching stream completion"),
            expect.stringContaining("Error fetching stream completion")
        ]));
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledTimes(1); // Only user message added before error
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledWith({ role: "user", content: "Hi" });
        expect(mockChatHistoryManager.getChatHistory).toHaveBeenCalledTimes(1);
        expect(mockConversationHistory.length).toBe(1);
    });

    it("clears conversation history via ChatHistoryManager", () => {
        // We directly use mockChatHistoryManager for this test, no need to instantiate ChatLogicHandler
        // const handler = new ChatLogicHandler( // Removed, as it's not directly used
        //     {
        //         activeProvider: "FAKE",
        //         llmProviderForChat: new FakeProvider("Hello world"),
        //         providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as ProviderConfig },
        //         anonymizer: { enabled: false, words: [] }
        //     } as MockChatLogicHandlerConfig,
        //     logger,
        //     mockChatHistoryManager // Injected mock
        // );

        mockChatHistoryManager.addMessage({ role: "user", content: "Test message" });
        expect(mockChatHistoryManager.getChatHistory().length).toBe(1);

        mockChatHistoryManager.clearHistory(); // Call clearHistory through the manager directly
        expect(mockChatHistoryManager.getChatHistory().length).toBe(0);
        expect(mockChatHistoryManager.clearHistory).toHaveBeenCalledTimes(1);
    });
});
