import { describe, it, expect } from "@jest/globals";
import { AGENT_MESSAGES, CHAT_MESSAGES, AGENT_LOGS, PROVIDER_MESSAGES, EXTENSION_MESSAGES, EXTENSION_LOGS, CONFIG_MESSAGES, CONFIG_LOGS, COMPLETION_LOGS, LLM_MESSAGES, LLM_LOGS } from "../../src/constants/messages.js";
import { WEBVIEW_COMMANDS, EXTENSION_COMMANDS, EXTENSION_EVENTS, MESSAGE_SENDERS } from "../../src/constants/protocol.js";
import { CONFIG_DEFAULTS } from "../../src/constants/config.js";
import { SYSTEM_PROMPTS } from "../../src/constants/prompts.js";
import { z } from "zod";

describe("Constants Integrity Sanity Checks", () => {
    const messageSections = { 
        AGENT_MESSAGES, CHAT_MESSAGES, AGENT_LOGS, PROVIDER_MESSAGES, 
        EXTENSION_MESSAGES, EXTENSION_LOGS, CONFIG_MESSAGES, CONFIG_LOGS, 
        COMPLETION_LOGS, LLM_MESSAGES, LLM_LOGS 
    };

    const protocolSections = {
        WEBVIEW_COMMANDS,
        EXTENSION_COMMANDS,
        EXTENSION_EVENTS,
        MESSAGE_SENDERS
    };

    const otherSections = {
        CONFIG_DEFAULTS,
        SYSTEM_PROMPTS
    };

    const allSections = { ...messageSections, ...protocolSections, ...otherSections };

    it("should have defined values for all constants", () => {
        Object.values(allSections).forEach(section => {
            Object.values(section).forEach(value => {
                expect(value).not.toBeUndefined();
                expect(value).not.toBeNull();
            });
        });
    });

    it("should match the expected configuration schema", () => {
        const ConfigDefaultsSchema = z.object({
            LOG_LEVEL: z.string(),
            MAX_AGENT_ITERATIONS: z.number(),
            TOOL_RESULT_MAX_LENGTH: z.number(),
            MAX_RETRIES: z.number(),
            INITIAL_DELAY: z.number(),
            AUTO_ACCEPT_EDITS: z.boolean(),
            MAX_SAVED_CHAT_SESSIONS: z.number(),
            SESSION_TITLE_MAX_LENGTH: z.number(),
            ANONYMIZER_ALLOWED_ENTROPY: z.number(),
            ANONYMIZER_MIN_LENGTH: z.number(),
            INLINE_COMPLETION_ENABLED: z.boolean(),
            INLINE_COMPLETION_SUPPORTED_LANGUAGES: z.array(z.string()),
            INLINE_COMPLETION_ENABLE_IN_UNTITLED_EDITORS: z.boolean(),
        });
        expect(() => ConfigDefaultsSchema.parse(CONFIG_DEFAULTS)).not.toThrow();
    });

    it("protocol values should be globally unique to avoid cross-talk", () => {
        const allProtocolValues: string[] = [];
        Object.values(protocolSections).forEach(section => {
            for (const value of Object.values(section)) {
                if (typeof value === 'string') {
                    allProtocolValues.push(value);
                }
            }
        });

        const uniqueValues = new Set(allProtocolValues);
        if (uniqueValues.size !== allProtocolValues.length) {
            const seen = new Set();
            const duplicates = allProtocolValues.filter(v => {
                if (seen.has(v)) {
                    return true;
                }
                seen.add(v);
                return false;
            });
            throw new Error(`Duplicate protocol values found: ${duplicates.join(', ')}`);
        }
        expect(uniqueValues.size).toBe(allProtocolValues.length);
    });

    describe("Specific Contract Validations", () => {
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

        it("SYSTEM_PROMPTS.AGENT should be defined", () => {
            expect(SYSTEM_PROMPTS.AGENT).toContain('code assistant');
        });
    });
});
