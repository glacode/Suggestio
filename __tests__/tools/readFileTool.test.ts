import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ReadFileTool } from "../../src/tools/readFileTool.js";
import { IWorkspaceProvider, IFileContentReader, IPathResolver } from "../../src/types.js";
import { createMockPathResolver, createMockFileContentReader, createMockWorkspaceProvider } from "../testUtils.js";

describe("ReadFileTool", () => {
    let workspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let fileReader: jest.Mocked<IFileContentReader>;
    let pathResolver: jest.Mocked<IPathResolver>;
    let tool: ReadFileTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = createMockWorkspaceProvider();
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        
        fileReader = createMockFileContentReader();
        pathResolver = createMockPathResolver();

        tool = new ReadFileTool(workspaceProvider, fileReader, pathResolver);
    });

    it("should return success: true and file content when read is successful", async () => {
        const filePath = "src/test.ts";
        const content = "console.log('hello');";
        fileReader.read.mockReturnValue(content);

        const result = await tool.execute({ path: filePath });

        expect(result.success).toBe(true);
        expect(result.content).toBe(content);
        expect(fileReader.read).toHaveBeenCalledWith(pathResolver.resolve(pathResolver.join(mockRootPath, filePath)));
    });

    it("should return success: false when file does not exist", async () => {
        const filePath = "non-existent.ts";
        fileReader.read.mockReturnValue(undefined);

        const result = await tool.execute({ path: filePath });

        expect(result.success).toBe(false);
        expect(result.content).toContain("Error: Failed to read file");
    });

    it("should return success: false when an error occurs during reading", async () => {
        const filePath = "error.ts";
        fileReader.read.mockImplementation(() => {
            throw new Error("Disk failure");
        });

        const result = await tool.execute({ path: filePath });

        expect(result.success).toBe(false);
        expect(result.content).toContain("Error reading file: Disk failure");
    });

    describe("Security", () => {
        it("should prevent accessing parent directories", async () => {
            const result = await tool.execute({ path: "../outside.ts" });
            expect(result.success).toBe(false);
            expect(result.content).toContain("Error: Access denied");
        });

        it("should prevent accessing absolute paths outside workspace via traversal", async () => {
            const result = await tool.execute({ path: "../../../../etc/passwd" });
            expect(result.success).toBe(false);
            expect(result.content).toContain("Error: Access denied");
        });

        it("should allow accessing valid files in subdirectories", async () => {
            fileReader.read.mockReturnValue("content");
            const result = await tool.execute({ path: "src/utils/tool.ts" });
            expect(result.success).toBe(true);
            expect(result.content).not.toContain("Error: Access denied");
        });
    });

    describe("formatMessage", () => {
        it("should return a human-readable message", () => {
            const message = tool.formatMessage({ path: "src/main.ts" });
            expect(message).toBe("Reading file src/main.ts");
        });
    });
});
