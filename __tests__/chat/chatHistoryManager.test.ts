import { describe, it, beforeEach, expect } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager } from "../../src/types.js";
import { ChatPrompt } from "../../src/chat/chatPrompt.js";
import { ChatHistoryManager } from "../../src/chat/chatHistoryManager.js";
import { EventBus } from "../../src/utils/eventBus.js";
import { FakeProvider, createDefaultConfig, createMockProviderConfig } from "../testUtils.js";

describe("Chat History Management (Unit Test)", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let chatHistoryManager: IChatHistoryManager;
    let eventBus: EventBus;

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
        chatHistoryManager = new ChatHistoryManager();
        eventBus = new EventBus();
    });

    it("should maintain history across two complete turns", async () => {
        // Setup FakeProvider to return different responses for each turn
        const fakeProvider = new FakeProvider([
            { role: "assistant", content: "Assistant Reply 1" },
            { role: "assistant", content: "Assistant Reply 2" }
        ], eventBus);

        const handler = new Agent({
            config: createDefaultConfig({
                activeProvider: "FAKE",
                llmProviderForChat: fakeProvider,
                providers: { FAKE: createMockProviderConfig() }
            }),
            log: logger,
            chatHistoryManager: chatHistoryManager,
            eventBus
        });

        // --- Turn 1 ---
        const userMessage1 = "User message 1";
        chatHistoryManager.addMessage({ role: "user", content: userMessage1 });
        const prompt1 = new ChatPrompt(chatHistoryManager.getChatHistory());
        await handler.run(prompt1);

        // --- Turn 2 ---
        const userMessage2 = "User message 2";
        chatHistoryManager.addMessage({ role: "user", content: userMessage2 });
        const prompt2 = new ChatPrompt(chatHistoryManager.getChatHistory());
        await handler.run(prompt2);

        // --- Verification ---
        const finalHistory = chatHistoryManager.getChatHistory();
        expect(finalHistory).toHaveLength(4);
        expect(finalHistory[0]).toEqual({ role: "user", content: userMessage1 });
        expect(finalHistory[1]).toEqual({ role: "assistant", content: "Assistant Reply 1" });
        expect(finalHistory[2]).toEqual({ role: "user", content: userMessage2 });
        expect(finalHistory[3]).toEqual({ role: "assistant", content: "Assistant Reply 2" });
    });

    it("should clear the history", () => {
        chatHistoryManager.addMessage({ role: "user", content: "some message" });
        chatHistoryManager.clearHistory();
        expect(chatHistoryManager.getChatHistory()).toHaveLength(0);
    });
});
