import { composeInvalidArgumentsMessage, composeDamagedArgumentsMessage, extractRequiredParameterNames } from "../../src/agent/toolArgumentMessages.js";
import { z } from "zod";
import { expect } from "@jest/globals";

describe("toolArgumentMessages", () => {
    it("should keep the zod-path wording identical to the pre-extraction message", () => {
        expect(composeInvalidArgumentsMessage("write_file", "path: Invalid input")).toBe(
            "Invalid arguments for tool 'write_file': path: Invalid input. Please correct the arguments and try again."
        );
    });

    it("should derive the required parameter names from the schema shape", () => {
        expect(extractRequiredParameterNames(z.object({ path: z.string(), content: z.string() }).strict())).toBe("path, content");
        expect(extractRequiredParameterNames(z.object({}))).toBe("");
    });

    it("should omit the required-parameters line when the schema requires nothing", () => {
        expect(composeDamagedArgumentsMessage("list_files", "Unexpected end of JSON input", "", "")).toBe(
            "The arguments for tool 'list_files' could not be parsed as JSON: Unexpected end of JSON input.\n" +
            "Original text sent before repair: \n" +
            "Re-send with a valid JSON object; escape inner quotes and newlines (\\\" \\n)."
        );
    });

    it("should list the required parameters when the schema demands them", () => {
        expect(
            composeDamagedArgumentsMessage(
                "write_file",
                "Unterminated string in JSON (fake)",
                '{"path": "x"',
                "path, content"
            )
        ).toBe(
            "The arguments for tool 'write_file' could not be parsed as JSON: Unterminated string in JSON (fake).\n" +
            'Original text sent before repair: {"path": "x"\n' +
            "Required parameters: path, content.\n" +
            "Re-send with a valid JSON object; escape inner quotes and newlines (\\\" \\n)."
        );
    });
});
