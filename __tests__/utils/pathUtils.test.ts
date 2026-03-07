import { describe, it, expect } from "@jest/globals";
import { normalizePath } from "../../src/utils/pathUtils.js";

describe("pathUtils", () => {
    describe("normalizePath", () => {
        it("should convert Windows backslashes to forward slashes", () => {
            expect(normalizePath("src\\utils\\file.ts")).toBe("src/utils/file.ts");
            expect(normalizePath("C:\\Users\\Name\\Project")).toBe("C:/Users/Name/Project");
        });

        it("should not affect Linux forward slashes", () => {
            expect(normalizePath("src/utils/file.ts")).toBe("src/utils/file.ts");
            expect(normalizePath("/home/user/project")).toBe("/home/user/project");
        });

        it("should handle mixed slashes", () => {
            expect(normalizePath("src\\utils/file.ts")).toBe("src/utils/file.ts");
        });
    });
});
