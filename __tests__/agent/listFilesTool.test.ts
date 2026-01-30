import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ListFilesTool } from "../../src/agent/tools.js";
import { IWorkspaceProvider, IDirectoryReader, IPathResolver } from "../../src/types.js";
import * as path from 'path';

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

        // Simple mock for path resolver that mimics node's path module behavior
        pathResolver = {
            join: (...paths: string[]) => path.join(...paths),
            resolve: (...paths: string[]) => path.resolve(...paths),
            relative: (from, to) => path.relative(from, to),
            basename: (p) => path.basename(p),
            dirname: (p) => path.dirname(p)
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