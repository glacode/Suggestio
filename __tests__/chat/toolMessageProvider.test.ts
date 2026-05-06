import { describe, it, expect } from "@jest/globals";
import { ToolMessageProvider } from "../../src/chat/toolMessageProvider.js";
import { IToolImplementation, ChatHistory } from "../../src/types.js";
import { z } from "zod";

describe("ToolMessageProvider", () => {
    const mockTool: IToolImplementation<any> = {
        definition: {
            name: "testTool",
            description: "A test tool",
            parameters: { type: "object", properties: { arg1: { type: "string" } } }
        },
        formatMessage: (args: any) => `Formatted: ${args.arg1}`,
        uiOptions: { collapseByDefault: true },
        schema: z.any(),
        execute: async () => ({ content: "result", success: true })
    };

    const provider = new ToolMessageProvider([mockTool]);

    it("getToolUI returns formatted message and uiOptions", () => {
        const result = provider.getToolUI("testTool", JSON.stringify({ arg1: "val1" }));
        expect(result).toEqual({
            displayMessage: "Formatted: val1",
            uiOptions: { collapseByDefault: true }
        });
    });

    it("getToolUI returns empty object for unknown tool", () => {
        const result = provider.getToolUI("unknownTool", "{}");
        expect(result).toEqual({});
    });

    it("getToolUI handles invalid JSON args gracefully", () => {
        const result = provider.getToolUI("testTool", "invalid-json");
        expect(result).toEqual({
            displayMessage: undefined,
            uiOptions: { collapseByDefault: true }
        });
    });

    it("enrichHistory adds displayMessage and uiOptions to assistant tool calls", () => {
        const history: ChatHistory = [
            { role: "user", content: "hello" },
            {
                role: "assistant",
                content: "",
                tool_calls: [
                    {
                        id: "call1",
                        type: "function",
                        function: {
                            name: "testTool",
                            arguments: JSON.stringify({ arg1: "val1" })
                        }
                    }
                ]
            }
        ];

        const enriched = provider.enrichHistory(history);

        expect(enriched[1].tool_calls[0]).toMatchObject({
            displayMessage: "Formatted: val1",
            uiOptions: { collapseByDefault: true }
        });
    });

    it("enrichHistory leaves other messages untouched", () => {
        const history: ChatHistory = [
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi" }
        ];

        const enriched = provider.enrichHistory(history);
        expect(enriched).toEqual(history);
    });
});
