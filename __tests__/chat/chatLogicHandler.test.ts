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

    async queryStream(_prompt: Prompt, _onToken: (token: string) => void): Promise<void> {
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

    it("returns completion on success", async () => {
        const handler = new ChatLogicHandler(
            { activeProvider: "FAKE" } as any,
            new FakeProvider("Hello world"),
            logger
        );

        const result = await handler.fetchCompletion("Hi");
        expect(result).toBe("Hello world");
        expect(logs).toEqual(expect.arrayContaining([
            expect.stringContaining("Fetching completion"),
            expect.stringContaining("Completion received")
        ]));
    });

    it("returns null when provider returns nothing", async () => {
        const handler = new ChatLogicHandler(
            { activeProvider: "FAKE" } as any,
            new FakeProvider(null),
            logger
        );

        const result = await handler.fetchCompletion("Hi");
        expect(result).toBeNull();
        expect(logs).toEqual(expect.arrayContaining([
            expect.stringContaining("Fetching completion"),
            expect.stringContaining("No completion returned")
        ]));
    });

    it("throws when provider.query throws", async () => {
        const handler = new ChatLogicHandler(
            { activeProvider: "FAKE" } as any,
            new FakeProvider(null, true),
            logger
        );

        await expect(handler.fetchCompletion("Hi")).rejects.toThrow("Simulated failure");
        expect(logs).toEqual(expect.arrayContaining([
            expect.stringContaining("Fetching completion"),
            expect.stringContaining("Error fetching completion")
        ]));
    });
});
