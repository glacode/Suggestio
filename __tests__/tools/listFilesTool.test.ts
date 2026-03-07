import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ListFilesTool } from "../../src/tools/index.js";
import { IWorkspaceProvider, IPathResolver, IWorkspaceScanner } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver } from "../testUtils.js";

describe("ListFilesTool Security", () => {
    let workspaceProvider: IWorkspaceProvider;
    let pathResolver: IPathResolver;
    let workspaceScanner: jest.Mocked<IWorkspaceScanner>;
    let tool: ListFilesTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = {
            rootPath: () => mockRootPath,
        };

        workspaceScanner = {
            scan: jest.fn<any>().mockResolvedValue(["file1.txt"])
        };

        pathResolver = createMockPathResolver();

        tool = new ListFilesTool(workspaceProvider, pathResolver, workspaceScanner);
    });

    it("should prevent accessing parent directories", async () => {
        const result = await tool.execute({ directory: "../", recursive: false });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
    });

    it("should prevent accessing absolute paths outside workspace via traversal", async () => {
        const result = await tool.execute({ directory: "../../../../etc/passwd", recursive: false });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
    });

    it("should return success: true and call scanner for valid directories", async () => {
        const result = await tool.execute({ directory: "src", recursive: false });
        expect(result.success).toBe(true);
        expect(workspaceScanner.scan).toHaveBeenCalledWith(
            expect.stringContaining("src"),
            { recursive: false }
        );
    });

    it("should pass the recursive flag to the scanner", async () => {
        await tool.execute({ directory: "", recursive: true });
        expect(workspaceScanner.scan).toHaveBeenCalledWith(
            mockRootPath,
            { recursive: true }
        );
    });

    it("should return success: false if scanner throws", async () => {
        workspaceScanner.scan.mockRejectedValue(new Error("Scan failed"));
        const result = await tool.execute({ directory: "", recursive: false });
        expect(result.success).toBe(false);
        expect(result.content).toContain("Error listing files: Scan failed");
    });

    describe("formatMessage", () => {
        it("should return a human-readable message for the root directory", () => {
            const message = tool.formatMessage({ recursive: false });
            expect(message).toBe("Listing files in the root directory");
        });

        it("should return a human-readable message for a specific directory", () => {
            const message = tool.formatMessage({ directory: "src/utils", recursive: false });
            expect(message).toBe("Listing files in src/utils");
        });

        it("should include recursive indication in the message", () => {
            const message = tool.formatMessage({ directory: "src", recursive: true });
            expect(message).toBe("Listing files in src (recursively)");
        });
    });
});
