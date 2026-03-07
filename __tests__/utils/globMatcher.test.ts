import { describe, it, expect } from "@jest/globals";
import { matchesGlob } from "../../src/utils/globMatcher.js";

describe("globMatcher", () => {
    it("should match simple files", () => {
        expect(matchesGlob("file.txt", "file.txt")).toBe(true);
        expect(matchesGlob("other.txt", "file.txt")).toBe(false);
    });

    it("should match with *", () => {
        expect(matchesGlob("file.txt", "*.txt")).toBe(true);
        expect(matchesGlob("file.js", "*.txt")).toBe(false);
    });

    it("should match with **", () => {
        expect(matchesGlob("src/utils/file.ts", "src/**/*.ts")).toBe(true);
        expect(matchesGlob("src/file.ts", "src/**/*.ts")).toBe(true);
        expect(matchesGlob("other/file.ts", "src/**/*.ts")).toBe(false);
    });

    it("should match directories (trailing slash)", () => {
        expect(matchesGlob("src/", "src/")).toBe(true);
        expect(matchesGlob("src/file.ts", "src/")).toBe(true);
    });

    it("should handle Windows backslashes", () => {
        expect(matchesGlob("src\\utils\\file.ts", "src/**/*.ts")).toBe(true);
        expect(matchesGlob("src\\file.ts", "src/")).toBe(true);
    });
});
