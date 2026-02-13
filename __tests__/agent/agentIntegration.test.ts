import { describe, it, beforeEach, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, IChatMessage, IPrompt, ChatHistory, IEventBus } from "../../src/types.js";
import { createDefaultConfig, createMockProviderConfig, FakeProvider, createMockEventBus } from "../testUtils.js";

describe("Agent (Integration) simple tests", () => {
    let mockChatHistoryManager: IChatHistoryManager;
    let mockChatHistory: ChatHistory;
    let mockPrompt: IPrompt;
    let mockEventBus: jest.Mocked<IEventBus>;

    beforeEach(() => {
        mockChatHistory = [];
        mockChatHistoryManager = {
            clearHistory: jest.fn(() => {
                mockChatHistory.length = 0; // Clear the array
            }),
            addMessage: jest.fn((message: IChatMessage) => {
                mockChatHistory.push(message);
            }),
            getChatHistory: jest.fn(() => mockChatHistory),
        };
        mockPrompt = {
            generateChatHistory: () => [{ role: 'user', content: 'Hi' }],
        };
        mockEventBus = createMockEventBus();
    });

    it("fetches stream chat response on success", async () => {
        const handler = new Agent({
            config: createDefaultConfig({
                activeProvider: "FAKE",
                llmProviderForChat: new FakeProvider([{ role: "assistant", content: "Hello world" }], mockEventBus),
                providers: { FAKE: createMockProviderConfig() },
            }),
            chatHistoryManager: mockChatHistoryManager,
            eventBus: mockEventBus
        });

        let streamedContent = "";
        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:token') {
                streamedContent += payload.token;
            }
        });

        await handler.run(mockPrompt);
        expect(streamedContent).toBe("Hello world");
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledTimes(1);
        expect(mockChatHistoryManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant", content: "Hello world" }));
        expect(mockChatHistory.length).toBe(1);
    });

    it("handles error when fetching stream chat response", async () => {
        const fakeProvider = new FakeProvider([], mockEventBus);
        jest.spyOn(fakeProvider, 'queryStream').mockRejectedValue(new Error("Simulated failure"));

        const handler = new Agent({
            config: createDefaultConfig({
                activeProvider: "FAKE",
                llmProviderForChat: fakeProvider,
                providers: { FAKE: createMockProviderConfig() },
            }),
            chatHistoryManager: mockChatHistoryManager,
            eventBus: mockEventBus
        });

        let streamedContent = "";
        mockEventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:token') {
                streamedContent += payload.token;
            }
        });

        await expect(handler.run(mockPrompt)).rejects.toThrow("Simulated failure");
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