import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ListFilesTool } from "../../src/agent/tools.js";
import { IWorkspaceProvider, IDirectoryProvider, IPathResolver } from "../../src/types.js";

describe("ListFilesTool Security", () => {
    let workspaceProvider: IWorkspaceProvider;
    let directoryProvider: IDirectoryProvider;
    let pathResolver: IPathResolver;
    let tool: ListFilesTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = {
            rootPath: () => mockRootPath
        };
        
        directoryProvider = {
            readdir: jest.fn<any>().mockReturnValue(["file1.txt"]),
            exists: jest.fn<any>().mockReturnValue(true)
        };

        // Simple mock for path resolver that mimics node's path module behavior for posix
        pathResolver = {
            join: (...paths: string[]) => paths.join('/'),
            resolve: (...paths: string[]) => {
                // Very basic mock resolve: handle starting with / or not
                let resolved = paths.join('/');
                if (resolved.startsWith('../')) {
                    // simulate going up from root if paths start with ../
                    // but since we don't have a real CWD in mock, this is tricky.
                    // For the test case "../", we want to ensure it resolves to something outside root.
                    // Let's assume the "current directory" for resolve is mockRootPath if not absolute.
                    // But typically resolve uses process.cwd().
                    // For our tool, we pass dirPath to resolve.
                    // If dirPath is relative, it joins with CWD.
                    // The tool does: dirPath = join(root, args.dir).
                    // So dirPath is absolute.
                    // resolve(absolute) returns absolute.
                    // Let's implement a fake resolve that handles ".."
                    
                    // Actually, the test inputs are:
                    // 1. { directory: "../" } -> join(root, "../") -> "/home/user/project/../" -> "/home/user"
                    // 2. { directory: "../../../../etc/passwd" } -> join(root, "..") -> "/etc/passwd"
                    return resolved;
                }
                return resolved;
            },
            relative: (_from, _to) => { return ""; }, // Not used in tool
            basename: (_p) => { return ""; } // Not used in tool
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