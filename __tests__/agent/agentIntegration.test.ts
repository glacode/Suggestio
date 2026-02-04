import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, ChatMessage, IPrompt, ChatHistory } from "../../src/types.js"; // Import ChatMessage from types.js
import { createDefaultConfig, createMockProviderConfig, FakeProvider } from "../testUtils.js";

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
        const handler = new Agent({
            config: createDefaultConfig({
                activeProvider: "FAKE",
                llmProviderForChat: new FakeProvider([{ role: "assistant", content: "Hello world" }]),
                providers: { FAKE: createMockProviderConfig() },
            }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager // Injected mock
        });

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
        const fakeProvider = new FakeProvider([]);
        jest.spyOn(fakeProvider, 'queryStream').mockRejectedValue(new Error("Simulated failure"));

        const handler = new Agent({
            config: createDefaultConfig({
                activeProvider: "FAKE",
                llmProviderForChat: fakeProvider,
                providers: { FAKE: createMockProviderConfig() },
            }),
            log: logger,
            chatHistoryManager: mockChatHistoryManager // Injected mock
        });

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
