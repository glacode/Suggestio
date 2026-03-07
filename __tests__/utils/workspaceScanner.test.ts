import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { WorkspaceScanner } from "../../src/utils/workspaceScanner.js";
import { IWorkspaceProvider, IDirectoryReader, IPathResolver, IIgnoreManager } from "../../src/types.js";
import { createMockPathResolver, createMockDirectoryReader, createMockIgnoreManager } from "../testUtils.js";

describe("WorkspaceScanner", () => {
    let workspaceProvider: IWorkspaceProvider;
    let directoryProvider: jest.Mocked<IDirectoryReader>;
    let pathResolver: IPathResolver;
    let ignoreManager: jest.Mocked<IIgnoreManager>;
    let scanner: WorkspaceScanner;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = {
            rootPath: () => mockRootPath,
        };
        
        directoryProvider = createMockDirectoryReader();
        pathResolver = createMockPathResolver();
        ignoreManager = createMockIgnoreManager();

        scanner = new WorkspaceScanner(workspaceProvider, directoryProvider, pathResolver, ignoreManager);
    });

    it("should list files in a directory non-recursively", async () => {
        directoryProvider.readdir.mockReturnValue(["file1.txt", "subdir"]);
        directoryProvider.isDirectory.mockImplementation((path: string) => path.endsWith("subdir"));

        const results = await scanner.scan(mockRootPath, { recursive: false });
        
        expect(results).toContain("file1.txt");
        expect(results).toContain("subdir/");
        expect(results).not.toContain("subdir/file2.txt");
    });

    it("should list files in a directory recursively", async () => {
        directoryProvider.readdir.mockImplementation((path: string) => {
            if (path === mockRootPath) { return ["file1.txt", "subdir"]; }
            if (path.endsWith("subdir")) { return ["file2.txt"]; }
            return [];
        });
        directoryProvider.isDirectory.mockImplementation((path: string) => path.endsWith("subdir"));

        const results = await scanner.scan(mockRootPath, { recursive: true });
        
        expect(results).toContain("file1.txt");
        expect(results).toContain("subdir/file2.txt");
    });

    it("should respect ignore rules", async () => {
        directoryProvider.readdir.mockReturnValue(["file1.txt", ".env", "node_modules"]);
        directoryProvider.isDirectory.mockReturnValue(false);
        ignoreManager.shouldIgnore.mockImplementation(async (path: string) => {
            return path.endsWith(".env") || path.endsWith("node_modules");
        });

        const results = await scanner.scan(mockRootPath, { recursive: true });
        
        expect(results).toContain("file1.txt");
        expect(results).not.toContain(".env");
        expect(results).not.toContain("node_modules");
    });

    it("should sort results for consistency", async () => {
        directoryProvider.readdir.mockReturnValue(["b.txt", "a.txt", "c.txt"]);
        directoryProvider.isDirectory.mockReturnValue(false);

        const results = await scanner.scan(mockRootPath, { recursive: false });
        
        expect(results).toEqual(["a.txt", "b.txt", "c.txt"]);
    });

    it("should return empty array if no root path", async () => {
        workspaceProvider.rootPath = jest.fn<any>().mockReturnValue(undefined);
        const results = await scanner.scan(mockRootPath, { recursive: false });
        expect(results).toEqual([]);
    });
});
