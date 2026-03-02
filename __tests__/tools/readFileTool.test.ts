import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ReadFileTool } from "../../src/tools/readFileTool.js";
import { IWorkspaceProvider, IFileContentReader, IPathResolver, IEventBus } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver, createMockFileContentReader, createMockWorkspaceProvider, createMockEventBus } from "../testUtils.js";

describe("ReadFileTool", () => {
    let workspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let fileReader: jest.Mocked<IFileContentReader>;
    let pathResolver: jest.Mocked<IPathResolver>;
    let eventBus: jest.Mocked<IEventBus>;
    let tool: ReadFileTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = createMockWorkspaceProvider();
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        
        fileReader = createMockFileContentReader();
        pathResolver = createMockPathResolver();
        eventBus = createMockEventBus();

        tool = new ReadFileTool(workspaceProvider, fileReader, pathResolver, eventBus);
    });

    it("should return success: true and file content when user confirms", async () => {
        const filePath = "src/test.ts";
        const content = "console.log('hello');";
        const toolCallId = "call-123";
        fileReader.read.mockReturnValue(content);

        // Mock eventBus.on to capture the callback and trigger it
        let confirmationCallback: any;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === 'user:confirmationResponse') {
                confirmationCallback = cb;
            }
            return { dispose: () => { } };
        });

        const executePromise = tool.execute({ path: filePath }, undefined, toolCallId);

        // Simulate user confirmation
        if (confirmationCallback) {
            confirmationCallback({ toolCallId, decision: 'allow' });
        }

        const result = await executePromise;

        expect(result.success).toBe(true);
        expect(result.content).toBe(content);
        expect(eventBus.emit).toHaveBeenCalledWith('agent:requestConfirmation', expect.objectContaining({
            toolCallId,
            message: expect.stringContaining(filePath)
        }));
    });

    it("should return success: false when user denies", async () => {
        const filePath = "src/test.ts";
        const toolCallId = "call-123";

        let confirmationCallback: any;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === 'user:confirmationResponse') {
                confirmationCallback = cb;
            }
            return { dispose: () => { } };
        });

        const executePromise = tool.execute({ path: filePath }, undefined, toolCallId);

        if (confirmationCallback) {
            confirmationCallback({ toolCallId, decision: 'deny' });
        }

        const result = await executePromise;

        expect(result.success).toBe(false);
        expect(result.content).toContain("User denied access");
        expect(fileReader.read).not.toHaveBeenCalled();
    });

    it("should return success: true immediately if no toolCallId is provided (backward compatibility/internal use)", async () => {
        const filePath = "src/test.ts";
        const content = "no confirmation needed";
        fileReader.read.mockReturnValue(content);

        const result = await tool.execute({ path: filePath });

        expect(result.success).toBe(true);
        expect(result.content).toBe(content);
        expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it("should handle cancellation signal by denying access", async () => {
        const filePath = "src/test.ts";
        const toolCallId = "call-123";
        const abortController = new AbortController();

        eventBus.on.mockReturnValue({ dispose: () => { } });

        const executePromise = tool.execute({ path: filePath }, abortController.signal, toolCallId);

        abortController.abort();

        const result = await executePromise;
        expect(result.success).toBe(false);
        expect(result.content).toContain("User denied access");
    });

    describe("Security", () => {
        it("should prevent accessing parent directories", async () => {
            const result = await tool.execute({ path: "../outside.ts" });
            expect(result.success).toBe(false);
            expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
        });

        it("should prevent accessing absolute paths outside workspace via traversal", async () => {
            const result = await tool.execute({ path: "../../../../etc/passwd" });
            expect(result.success).toBe(false);
            expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
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
