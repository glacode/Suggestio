import { describe, it, expect } from "@jest/globals";
import { adaptiveMiddleTruncate } from "../../src/utils/textUtils.js";

describe("adaptiveMiddleTruncate", () => {
    it("returns original text if within length limit", () => {
        const text = "Hello world";
        expect(adaptiveMiddleTruncate(text, 20)).toBe(text);
    });

    it("truncates from middle if exceeding limit", () => {
        const text = "A".repeat(1000);
        const maxLength = 200;
        const result = adaptiveMiddleTruncate(text, maxLength);
        
        expect(result.length).toBeLessThanOrEqual(text.length);
        expect(result).toContain("... (truncated");
        expect(result).toContain("characters) ...");
        expect(result.startsWith("A")).toBe(true);
        expect(result.endsWith("A")).toBe(true);
    });

    it("handles very small maxLength by returning at least the ellipsis", () => {
        const text = "Some long text";
        const result = adaptiveMiddleTruncate(text, 5);
        expect(result).toContain("truncated");
    });

    it("splits roughly in half when truncated", () => {
        const text = "HEAD" + "M".repeat(1000) + "TAIL";
        const result = adaptiveMiddleTruncate(text, 200);
        expect(result).toContain("HEAD");
        expect(result).toContain("TAIL");
        expect(result).toContain("truncated");
    });

    it("matches exact string literal transformation", () => {
        const input = `Line 1: start of the document
Line 2: some more information
Line 3: this part should be visible
Line 4: this is the middle that will be cut out
Line 5: even more middle content to be sure
Line 6: almost at the end of the cut
Line 7: this part should be visible too
Line 8: final metadata
Line 9: end of the document`;

        const result = adaptiveMiddleTruncate(input, 200);

        const expected = `Line 1: start of the document
Line 2: some more information
Line 3: this part sho

... (truncated 115 characters) ...

his part should be visible too
Line 8: final metadata
Line 9: end of the document`;

        expect(result).toBe(expected);
    });
});
