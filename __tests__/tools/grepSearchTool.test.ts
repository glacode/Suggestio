import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { GrepSearchTool } from "../../src/tools/index.js";
import { IWorkspaceProvider, IPathResolver, IFileContentReader, IEventBus, IWorkspaceScanner } from "../../src/types.js";
import { createMockPathResolver, createMockFileContentReader, createMockEventBus } from "../testUtils.js";

describe("GrepSearchTool", () => {
    let workspaceProvider: IWorkspaceProvider;
    let fileReader: jest.Mocked<IFileContentReader>;
    let pathResolver: IPathResolver;
    let eventBus: jest.Mocked<IEventBus>;
    let workspaceScanner: jest.Mocked<IWorkspaceScanner>;
    let tool: GrepSearchTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = {
            rootPath: () => mockRootPath,
        };

        fileReader = createMockFileContentReader();
        pathResolver = createMockPathResolver();
        eventBus = createMockEventBus();
        workspaceScanner = {
            scan: jest.fn<any>().mockResolvedValue(["file1.txt", "src/file2.ts"])
        };

        tool = new GrepSearchTool(workspaceProvider, fileReader, pathResolver, eventBus, workspaceScanner);

        // Default: allow confirmation
        eventBus.on.mockImplementation((event: string, handler: any) => {
            if (event === 'user:confirmationResponse') {
                setTimeout(() => handler({ toolCallId: 'test-id', decision: 'allow' }), 0);
            }
            return { dispose: () => {} };
        });
    });

    it("should find matches in files", async () => {
        fileReader.read.mockImplementation((path: string) => {
            if (path.endsWith("file1.txt")) { return "hello world\nthis is a test"; }
            if (path.endsWith("file2.ts")) { return "import { something } from 'somewhere';\nconsole.log('hello');"; }
            return undefined;
        });

        const result = await tool.execute({ pattern: "hello", isCaseSensitive: false }, undefined, "test-id");
        expect(result.success).toBe(true);
        const matches = JSON.parse(result.content);
        expect(matches).toHaveLength(2);
        expect(matches[0]).toEqual({ path: "file1.txt", line: 1, text: "hello world" });
        expect(matches[1]).toEqual({ path: "src/file2.ts", line: 2, text: "console.log('hello');" });
    });

    it("should respect case sensitivity", async () => {
        fileReader.read.mockImplementation((path: string) => {
            if (path.endsWith("file1.txt")) { return "Hello\nhello"; }
            return undefined;
        });

        const resultSensitive = await tool.execute({ pattern: "Hello", isCaseSensitive: true }, undefined, "test-id");
        const matchesSensitive = JSON.parse(resultSensitive.content);
        expect(matchesSensitive).toHaveLength(1);
        expect(matchesSensitive[0].text).toBe("Hello");

        const resultInsensitive = await tool.execute({ pattern: "Hello", isCaseSensitive: false }, undefined, "test-id");
        const matchesInsensitive = JSON.parse(resultInsensitive.content);
        expect(matchesInsensitive).toHaveLength(2);
    });

    it("should filter files using include glob", async () => {
        fileReader.read.mockReturnValue("match");
        
        const result = await tool.execute({ pattern: "match", include: "src/**/*.ts", isCaseSensitive: false }, undefined, "test-id");
        const matches = JSON.parse(result.content);
        expect(matches).toHaveLength(1);
        expect(matches[0].path).toBe("src/file2.ts");
    });

    it("should filter files using exclude glob", async () => {
        fileReader.read.mockReturnValue("match");
        
        const result = await tool.execute({ pattern: "match", exclude: "src/**", isCaseSensitive: false }, undefined, "test-id");
        const matches = JSON.parse(result.content);
        expect(matches).toHaveLength(1);
        expect(matches[0].path).toBe("file1.txt");
    });

    it("should truncate results if they exceed MAX_MATCHES", async () => {
        const manyLines = Array(150).fill("match").join("\n");
        fileReader.read.mockReturnValue(manyLines);

        const result = await tool.execute({ pattern: "match", isCaseSensitive: false }, undefined, "test-id");
        expect(result.content).toContain("(Note: Results were truncated to 100 matches.)");
        const matches = JSON.parse(result.content.split("\n\n")[0]);
        expect(matches).toHaveLength(100);
    });

    it("should return 'No matches found.' if nothing matches", async () => {
        fileReader.read.mockReturnValue("no-match-here");
        const result = await tool.execute({ pattern: "something-else", isCaseSensitive: false }, undefined, "test-id");
        expect(result.content).toBe("No matches found.");
    });

    it("should deny execution if user denies confirmation", async () => {
        eventBus.on.mockImplementation((event: string, handler: any) => {
            if (event === 'user:confirmationResponse') {
                setTimeout(() => handler({ toolCallId: 'test-id', decision: 'deny' }), 0);
            }
            return { dispose: () => {} };
        });

        const result = await tool.execute({ pattern: "test", isCaseSensitive: false }, undefined, "test-id");
        expect(result.success).toBe(false);
        expect(result.content).toContain("User denied permission");
    });
});
