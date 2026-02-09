import { describe, it, expect } from "@jest/globals";
import { AGENT_MESSAGES, CHAT_MESSAGES, AGENT_LOGS } from "../../src/constants/messages.js";

describe("Messages Constants Integrity", () => {
    const allSections = { AGENT_MESSAGES, CHAT_MESSAGES, AGENT_LOGS };

    it("should not have any empty values", () => {
        Object.values(allSections).forEach(section => {
            Object.values(section).forEach(value => {
                const stringValue = typeof value === 'function' ? value('test') : value;
                expect(stringValue.length).toBeGreaterThan(0);
            });
        });
    });

    it("should have unique values within each section to avoid ambiguity", () => {
        Object.values(allSections).forEach(section => {
            const values = Object.values(section).map(v => typeof v === 'function' ? v('unique') : v);
            const uniqueValues = new Set(values);
            expect(uniqueValues.size).toBe(values.length);
        });
    });

    it("AGENT_MESSAGES.ERROR_NO_WORKSPACE should match the expected literal contract", () => {
        expect(AGENT_MESSAGES.ERROR_NO_WORKSPACE).toBe('Error: No workspace open.');
    });

    it("AGENT_MESSAGES.ERROR_TOOL_NOT_FOUND should include the tool name", () => {
        expect(AGENT_MESSAGES.ERROR_TOOL_NOT_FOUND('myTool')).toBe('Error: Tool myTool not found.');
    });

    it("CHAT_MESSAGES.MAX_ITERATIONS_REACHED should include the limit", () => {
        expect(CHAT_MESSAGES.MAX_ITERATIONS_REACHED(5)).toContain('5');
    });

    it("AGENT_LOGS.EXECUTING_TOOL should include the tool name", () => {
        expect(AGENT_LOGS.EXECUTING_TOOL('myTool')).toBe('Executing tool: myTool');
    });
});