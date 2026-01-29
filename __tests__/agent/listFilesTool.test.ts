import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ListFilesTool } from "../../src/agent/tools.js";
import { IWorkspaceProvider, IDirectoryReader, IPathResolver } from "../../src/types.js";

describe("ListFilesTool Security", () => {
    let workspaceProvider: IWorkspaceProvider;
    let directoryProvider: IDirectoryReader;
    let pathResolver: IPathResolver;
    let tool: ListFilesTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = {
            rootPath: () => mockRootPath,
        };
        
        directoryProvider = {
            readdir: jest.fn<any>().mockReturnValue(["file1.txt"]),
            exists: jest.fn<any>().mockReturnValue(true),
        };

        // Simple mock for path resolver that mimics node's path module behavior for posix
        pathResolver = {
            join: (...paths: string[]) => paths.join('/'),
            resolve: (...paths: string[]) => {
                // ... same logic as before ...
                let resolved = paths.join('/');
                return resolved;
            },
            relative: (_from, _to) => { return ""; }, // Not used in tool
            basename: (_p) => { return ""; }, // Not used in tool
            dirname: (p) => p.split('/').slice(0, -1).join('/') || '/'
        };

        // Improve mock pathResolver to be more realistic for the test cases
        pathResolver.join = (...paths: string[]) => {
            // Simplified join logic for testing
            return paths.join('/').replace(/\/+/g, '/');
        };
        pathResolver.resolve = (...paths: string[]) => {
            // We need to simulate normalizing ".."
            // Since we know the inputs for the tests, we can map them or use a smarter mock.
            const fullPath = paths.join('/');
            
            if (fullPath.includes('/home/user/project/../')) {
                return '/home/user';
            }
            if (fullPath.includes('/home/user/project/../../../../etc/passwd')) {
                return '/etc/passwd';
            }
             if (fullPath.includes('/home/user/project/src')) {
                return '/home/user/project/src';
            }
            return fullPath;
        };


        tool = new ListFilesTool(workspaceProvider, directoryProvider, pathResolver);
    });

    it("should prevent accessing parent directories", async () => {
        const result = await tool.execute({ directory: "../" });
        expect(result).toContain("Error: Access denied");
    });

    it("should prevent accessing absolute paths outside workspace via traversal", async () => {
        const result = await tool.execute({ directory: "../../../../etc/passwd" });
        expect(result).toContain("Error: Access denied");
    });

    it("should allow accessing valid subdirectories", async () => {
        const result = await tool.execute({ directory: "src" });
        expect(result).not.toContain("Error: Access denied");
        expect(result).toContain("file1.txt");
    });
});