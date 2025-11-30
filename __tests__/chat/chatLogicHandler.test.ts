import { describe, it, beforeEach, expect } from "@jest/globals";
import { ChatLogicHandler } from "../../src/chat/chatLogicHandler.js";
import { llmProvider } from "../../src/providers/llmProvider.js";
import { Prompt } from "../../src/promptBuilder/prompt.js";
import { Config, ProviderConfig } from "../../src/config/types.js"; // Import Config and ProviderConfig types

// Define a minimal mock config interface for testing purposes
interface MockChatLogicHandlerConfig extends Pick<Config, 'activeProvider' | 'llmProviderForChat' | 'providers' | 'anonymizer'> { }

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
                llmProviderForChat: new FakeProvider("Hello world"),
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as ProviderConfig }, // Add mock for providers
                anonymizer: { enabled: false, words: [] } // Add mock for anonymizer
            } as MockChatLogicHandlerConfig, // Use the new mock interface
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
                llmProviderForChat: new FakeProvider(null, true),
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as ProviderConfig }, // Add mock for providers
                anonymizer: { enabled: false, words: [] } // Add mock for anonymizer
            } as MockChatLogicHandlerConfig, // Use the new mock interface
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
            {
                activeProvider: "FAKE",
                llmProviderForChat: new FakeProvider("Hello world"),
                providers: { FAKE: { model: "fake-model", apiKey: "fake-key" } as ProviderConfig }, // Add mock for providers
                anonymizer: { enabled: false, words: [] } // Add mock for anonymizer
            } as MockChatLogicHandlerConfig, // Use the new mock interface
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
