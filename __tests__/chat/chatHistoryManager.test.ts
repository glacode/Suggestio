import { describe, it, beforeEach, expect } from "@jest/globals";
import { Agent } from "../../src/agent/agent.js";
import { IChatHistoryManager, IPrompt, Config, IProviderConfig, ILlmProvider, ChatMessage, ToolDefinition } from "../../src/types.js";
import { ChatPrompt } from "../../src/chat/chatPrompt.js";
import { ChatHistoryManager } from "../../src/chat/chatHistoryManager.js";

// Define a minimal mock config interface for testing purposes
interface MockConfig extends Pick<Config, 'activeProvider' | 'llmProviderForChat' | 'providers' | 'anonymizer'> { }

class FakeProvider implements ILlmProvider {
    private responses: string[];
    private callCount: number = 0;

    constructor(responses: string[]) {
        this.responses = responses;
    }

    async query(_prompt: IPrompt, _tools?: ToolDefinition[]): Promise<ChatMessage | null> {
        const content = this.responses[this.callCount++];
        if (content === undefined) { return null; }
        return { role: "assistant", content };
    }

    async queryStream(_prompt: IPrompt, onToken: (token: string) => void, _tools?: ToolDefinition[]): Promise<ChatMessage | null> {
        const content = this.responses[this.callCount++];
        if (content === undefined) { return null; }
        onToken(content);
        return { role: "assistant", content };
    }
}

describe("Chat History Management (Unit Test)", () => {
    let logs: string[];
    let logger: (msg: string) => void;
    let chatHistoryManager: IChatHistoryManager;

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
        chatHistoryManager = new ChatHistoryManager();
    });

    it("should maintain history across two complete turns", async () => {
        // Setup FakeProvider to return different responses for each turn
        const fakeProvider = new FakeProvider(["Assistant Reply 1", "Assistant Reply 2"]);

        const handler = new Agent(
            {
                activeProvider: "FAKE",
                llmProviderForChat: fakeProvider,
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as IProviderConfig },
                anonymizer: { enabled: false, words: [] }
            } as MockConfig,
            logger,
            chatHistoryManager
        );

        // --- Turn 1 ---
        const userMessage1 = "User message 1";
        chatHistoryManager.addMessage({ role: "user", content: userMessage1 });
        const prompt1 = new ChatPrompt(chatHistoryManager.getChatHistory());
        await handler.run(prompt1, (_token: string) => { /* do nothing with tokens in this test */ });

        // --- Turn 2 ---
        const userMessage2 = "User message 2";
        chatHistoryManager.addMessage({ role: "user", content: userMessage2 });
        const prompt2 = new ChatPrompt(chatHistoryManager.getChatHistory());
        await handler.run(prompt2, (_token: string) => { /* do nothing with tokens in this test */ });

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
