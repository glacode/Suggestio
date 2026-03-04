import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ListFilesTool } from "../../src/tools/index.js";
import { IWorkspaceProvider, IDirectoryReader, IPathResolver, IIgnoreManager } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver, createMockDirectoryReader, createMockIgnoreManager } from "../testUtils.js";

describe("ListFilesTool Security", () => {
    let workspaceProvider: IWorkspaceProvider;
    let directoryProvider: jest.Mocked<IDirectoryReader>;
    let pathResolver: IPathResolver;
    let ignoreManager: jest.Mocked<IIgnoreManager>;
    let tool: ListFilesTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = {
            rootPath: () => mockRootPath,
        };
        
        directoryProvider = createMockDirectoryReader();
        directoryProvider.readdir.mockReturnValue(["file1.txt", ".env", "node_modules"]);
        directoryProvider.exists.mockReturnValue(true);

        pathResolver = createMockPathResolver();
        ignoreManager = createMockIgnoreManager();
        ignoreManager.shouldIgnore.mockImplementation(async (path) => {
            return path.endsWith(".env") || path.endsWith("node_modules");
        });

        tool = new ListFilesTool(workspaceProvider, directoryProvider, pathResolver, ignoreManager);
    });

    it("should prevent accessing parent directories", async () => {
        const result = await tool.execute({ directory: "../" });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
    });

    it("should prevent accessing absolute paths outside workspace via traversal", async () => {
        const result = await tool.execute({ directory: "../../../../etc/passwd" });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
    });

    it("should return success: false for non-existent directories", async () => {
        directoryProvider.exists.mockReturnValue(false);
        const result = await tool.execute({ directory: "non-existent" });
        expect(result.success).toBe(false);
        expect(result.content).toContain("Error: Directory non-existent does not exist");
    });

    it("should filter out ignored files and directories", async () => {
        const result = await tool.execute({ directory: "" });
        expect(result.success).toBe(true);
        const files = JSON.parse(result.content);
        expect(files).toContain("file1.txt");
        expect(files).not.toContain(".env");
        expect(files).not.toContain("node_modules");
    });

    it("should allow accessing valid subdirectories", async () => {
        const result = await tool.execute({ directory: "src" });
        expect(result.success).toBe(true);
        expect(result.content).not.toContain("Error: Access denied");
        expect(result.content).toContain("file1.txt");
    });
    
        describe("formatMessage", () => {
            it("should return a human-readable message for the root directory", () => {
                const message = tool.formatMessage({});
                expect(message).toBe("Listing files in the root directory");
            });
    
            it("should return a human-readable message for a specific directory", () => {
                const message = tool.formatMessage({ directory: "src/utils" });
                expect(message).toBe("Listing files in src/utils");
            });
        });
    });
    