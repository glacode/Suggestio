import { getJsonParseFailure, DAMAGED_ARGUMENTS_STUB } from "../../src/providers/toolCallJson.js";
import { expect } from "@jest/globals";

describe("toolCallJson", () => {
    it("should accept a valid JSON object string", () => {
        expect(getJsonParseFailure('{"path": "style.css", "content": "body {}"}')).toBeNull();
    });

    it("should reject non-object JSON with a descriptive failure", () => {
        expect(getJsonParseFailure("[1]")).toBe("JSON value is not an object");
        expect(getJsonParseFailure("null")).toBe("JSON value is not an object");
    });

    it("should surface the underlying JSON.parse error for truncated arguments", () => {
        expect(getJsonParseFailure('{"path": "task-manager/style.cs')).toBe(
            "Unterminated string in JSON at position 31 (line 1 column 32)"
        );
    });

    it("should surface the underlying JSON.parse error for improperly quoted arguments", () => {
        expect(getJsonParseFailure('{"path": "x.ts", "content": "h1 { font-family: "Aria')).toBe(
            "Expected ',' or '}' after property value in JSON at position 48 (line 1 column 49)"
        );
    });

    it("should surface the underlying JSON.parse error for empty arguments", () => {
        expect(getJsonParseFailure("")).toBe("Unexpected end of JSON input");
    });

    it("should pin the damaged-arguments stub text", () => {
        expect(DAMAGED_ARGUMENTS_STUB).toBe(
            '{"_argumentsWereDamaged": "The original arguments text was unparseable JSON and has been replaced by this stub. See the following tool result for the original text and required parameters."}'
        );
    });
});
