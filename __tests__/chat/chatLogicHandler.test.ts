import { describe, it, beforeEach, expect } from "@jest/globals";
import { ChatLogicHandler } from "../../src/chat/chatLogicHandler.js";
import { llmProvider } from "../../src/providers/llmProvider.js";
import { Prompt } from "../../src/promptBuilder/prompt.js";

class FakeProvider implements llmProvider {
    constructor(private reply: string | null, private shouldThrow = false) { }

    async query(_prompt: Prompt): Promise<string | null> {
        if (this.shouldThrow) { throw new Error("Simulated failure"); }
        return this.reply;
    }

    async queryStream(_prompt: Prompt, onToken: (token: string) => void): Promise<void> {
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

    beforeEach(() => {
        logs = [];
        logger = (msg: string) => logs.push(msg);
    });

    it("fetches stream chat response on success", async () => {
        const handler = new ChatLogicHandler(
            {
                activeProvider: "FAKE",
                chatProvider: new FakeProvider("Hello world")
            } as any,
            logger
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
    });

    it("handles error when fetching stream chat response", async () => {
        const handler = new ChatLogicHandler(
            {
                activeProvider: "FAKE",
                chatProvider: new FakeProvider(null, true)
            } as any,
            logger
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
    });

    it("clears conversation history", () => {
        const handler = new ChatLogicHandler(
            { activeProvider: "FAKE", chatProvider: new FakeProvider("Hello world") } as any,
            logger
        );

        // Add some messages to history (implicitly tested by fetchStreamChatResponse adding messages)
        // For a more robust test, we would mock ConversationHistory explicitly.
        // For now, we'll rely on the internal state for simplicity.
        handler["conversationHistory"].addMessage({ role: "user", content: "Test message" });
        expect(handler["conversationHistory"].getHistory().length).toBe(1);

        handler.clearHistory();
        expect(handler["conversationHistory"].getHistory().length).toBe(0);
    });
});
