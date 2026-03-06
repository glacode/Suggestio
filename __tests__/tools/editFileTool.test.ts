import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { EditFileTool } from "../../src/tools/editFileTool.js";
import { IWorkspaceProvider, IFileContentReader, IFileContentWriter, IPathResolver, IEventBus, IIgnoreManager, IUserConfirmationPayload } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver, createMockFileContentReader, createMockFileContentWriter, createMockWorkspaceProvider, createMockEventBus, createMockIgnoreManager } from "../testUtils.js";

describe("EditFileTool", () => {
    let workspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let fileReader: jest.Mocked<IFileContentReader>;
    let fileWriter: jest.Mocked<IFileContentWriter>;
    let pathResolver: jest.Mocked<IPathResolver>;
    let eventBus: jest.Mocked<IEventBus>;
    let ignoreManager: jest.Mocked<IIgnoreManager>;
    let tool: EditFileTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = createMockWorkspaceProvider();
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        
        fileReader = createMockFileContentReader();
        fileWriter = createMockFileContentWriter();
        pathResolver = createMockPathResolver();
        eventBus = createMockEventBus();
        ignoreManager = createMockIgnoreManager();
        ignoreManager.shouldIgnore.mockResolvedValue(false);

        tool = new EditFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager);
    });

    it("should overwrite file and return success when user confirms", async () => {
        const filePath = "src/test.ts";
        const oldContent = "old content";
        const newContent = "new content";
        const toolCallId = "call-edit-123";
        
        fileReader.read.mockReturnValue(oldContent);

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
                        userResponseCallback({ toolCallId, decision: 'allow' });
                    }
                });
            }
            return true;
        });

        const result = await tool.execute({ path: filePath, content: newContent }, undefined, toolCallId);

        // Verify event was emitted with diff data
        expect(eventBus.emit).toHaveBeenCalledWith('agent:requestConfirmation', expect.objectContaining({
            toolCallId,
            diffData: {
                oldContent,
                newContent,
                filePath
            }
        }));

        expect(result.success).toBe(true);
        expect(fileWriter.write).toHaveBeenCalledWith(expect.anything(), newContent);
    });

    it("should NOT overwrite file and return error when user denies", async () => {
        const filePath = "src/test.ts";
        const newContent = "should not be written";
        const toolCallId = "call-edit-456";

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

        const result = await tool.execute({ path: filePath, content: newContent }, undefined, toolCallId);

        expect(result.success).toBe(false);
        expect(result.content).toContain("User denied permission");
        expect(fileWriter.write).not.toHaveBeenCalled();
    });

    it("should treat missing file as empty string for diffing", async () => {
        const filePath = "new-file.ts";
        const newContent = "fresh content";
        const toolCallId = "call-new-789";
        
        fileReader.read.mockReturnValue(undefined);

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
                        userResponseCallback({ toolCallId, decision: 'allow' });
                    }
                });
            }
            return true;
        });

        await tool.execute({ path: filePath, content: newContent }, undefined, toolCallId);

        expect(eventBus.emit).toHaveBeenCalledWith('agent:requestConfirmation', expect.objectContaining({
            diffData: expect.objectContaining({ oldContent: '' })
        }));
    });

    describe("Security", () => {
        it("should prevent accessing parent directories", async () => {
            const result = await tool.execute({ path: "../outside.ts", content: "hacked" });
            expect(result.success).toBe(false);
            expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
            expect(fileWriter.write).not.toHaveBeenCalled();
        });

        it("should prevent accessing absolute paths outside workspace via traversal", async () => {
            const result = await tool.execute({ path: "../../../../etc/passwd", content: "hacked" });
            expect(result.success).toBe(false);
            expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
        });

        it("should prevent accessing ignored files", async () => {
            const filePath = ".env";
            ignoreManager.shouldIgnore.mockResolvedValue(true);
            
            const result = await tool.execute({ path: filePath, content: "hacked" });
            
            expect(result.success).toBe(false);
            expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_IGNORED(filePath));
            expect(fileWriter.write).not.toHaveBeenCalled();
        });
    });
});
