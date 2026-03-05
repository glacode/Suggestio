import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ReadFileTool } from "../../src/tools/readFileTool.js";
import { IWorkspaceProvider, IFileContentReader, IPathResolver, IEventBus, IIgnoreManager, IUserConfirmationPayload } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver, createMockFileContentReader, createMockWorkspaceProvider, createMockEventBus, createMockIgnoreManager } from "../testUtils.js";

describe("ReadFileTool", () => {
    let workspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let fileReader: jest.Mocked<IFileContentReader>;
    let pathResolver: jest.Mocked<IPathResolver>;
    let eventBus: jest.Mocked<IEventBus>;
    let ignoreManager: jest.Mocked<IIgnoreManager>;
    let tool: ReadFileTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = createMockWorkspaceProvider();
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        
        fileReader = createMockFileContentReader();
        pathResolver = createMockPathResolver();
        eventBus = createMockEventBus();
        ignoreManager = createMockIgnoreManager();
        ignoreManager.shouldIgnore.mockResolvedValue(false);

        tool = new ReadFileTool(workspaceProvider, fileReader, pathResolver, eventBus, ignoreManager);
    });

    it("should return success: true and file content when user confirms", async () => {
        const filePath = "src/test.ts";
        const content = "console.log('hello');";
        const toolCallId = "call-123";
        fileReader.read.mockReturnValue(content);

        // Capture the callback registered by the tool
        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === 'user:confirmationResponse') {
                userResponseCallback = cb;
            }
            return { dispose: () => { } };
        });

        // Listen for the request to trigger the response
        eventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:requestConfirmation' && payload.toolCallId === toolCallId) {
                // Use setImmediate to ensure the tool has started awaiting the promise
                setImmediate(() => {
                    if (userResponseCallback) {
                        userResponseCallback({ toolCallId, decision: 'allow' });
                    }
                });
            }
            return true;
        });

        const result = await tool.execute({ path: filePath }, undefined, toolCallId);

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

        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === 'user:confirmationResponse') {
                userResponseCallback = cb;
            }
            return { dispose: () => { } };
        });

        eventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:requestConfirmation' && payload.toolCallId === toolCallId) {
                setImmediate(() => {
                    if (userResponseCallback) {
                        userResponseCallback({ toolCallId, decision: 'deny' });
                    }
                });
            }
            return true;
        });

        const result = await tool.execute({ path: filePath }, undefined, toolCallId);

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

        // Abort after a small tick to let the tool reach the promise
        await new Promise(resolve => setImmediate(resolve));
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

        it("should prevent accessing ignored files", async () => {
            const filePath = ".env";
            ignoreManager.shouldIgnore.mockResolvedValue(true);
            
            const result = await tool.execute({ path: filePath });
            
            expect(result.success).toBe(false);
            expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_IGNORED);
            expect(fileReader.read).not.toHaveBeenCalled();
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
