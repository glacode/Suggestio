import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { EditFileTool } from "../../src/tools/editFileTool.js";
import { IWorkspaceProvider, IFileContentReader, IFileContentWriter, IPathResolver, IEventBus } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver, createMockFileContentReader, createMockFileContentWriter, createMockWorkspaceProvider, createMockEventBus } from "../testUtils.js";

describe("EditFileTool", () => {
    let workspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let fileReader: jest.Mocked<IFileContentReader>;
    let fileWriter: jest.Mocked<IFileContentWriter>;
    let pathResolver: jest.Mocked<IPathResolver>;
    let eventBus: jest.Mocked<IEventBus>;
    let tool: EditFileTool;
    const mockRootPath = "/home/user/project";

    beforeEach(() => {
        workspaceProvider = createMockWorkspaceProvider();
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        
        fileReader = createMockFileContentReader();
        fileWriter = createMockFileContentWriter();
        pathResolver = createMockPathResolver();
        eventBus = createMockEventBus();

        tool = new EditFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus);
    });

    it("should overwrite file and return success when user confirms", async () => {
        const filePath = "src/test.ts";
        const oldContent = "old content";
        const newContent = "new content";
        const toolCallId = "call-edit-123";
        
        fileReader.read.mockReturnValue(oldContent);

        let confirmationCallback: any;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === 'user:confirmationResponse') {
                confirmationCallback = cb;
            }
            return { dispose: () => { } };
        });

        const executePromise = tool.execute({ path: filePath, content: newContent }, undefined, toolCallId);

        // Verify event was emitted with diff data
        expect(eventBus.emit).toHaveBeenCalledWith('agent:requestConfirmation', expect.objectContaining({
            toolCallId,
            diffData: {
                oldContent,
                newContent,
                filePath
            }
        }));

        // Simulate user confirmation
        if (confirmationCallback) {
            confirmationCallback({ toolCallId, decision: 'allow' });
        }

        const result = await executePromise;

        expect(result.success).toBe(true);
        expect(fileWriter.write).toHaveBeenCalledWith(expect.anything(), newContent);
    });

    it("should NOT overwrite file and return error when user denies", async () => {
        const filePath = "src/test.ts";
        const newContent = "should not be written";
        const toolCallId = "call-edit-456";

        let confirmationCallback: any;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === 'user:confirmationResponse') {
                confirmationCallback = cb;
            }
            return { dispose: () => { } };
        });

        const executePromise = tool.execute({ path: filePath, content: newContent }, undefined, toolCallId);

        if (confirmationCallback) {
            confirmationCallback({ toolCallId, decision: 'deny' });
        }

        const result = await executePromise;

        expect(result.success).toBe(false);
        expect(result.content).toContain("User denied permission");
        expect(fileWriter.write).not.toHaveBeenCalled();
    });

    it("should treat missing file as empty string for diffing", async () => {
        const filePath = "new-file.ts";
        const newContent = "fresh content";
        const toolCallId = "call-new-789";
        
        fileReader.read.mockReturnValue(undefined);

        let confirmationCallback: any;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === 'user:confirmationResponse') {
                confirmationCallback = cb;
            }
            return { dispose: () => { } };
        });

        const executePromise = tool.execute({ path: filePath, content: newContent }, undefined, toolCallId);

        expect(eventBus.emit).toHaveBeenCalledWith('agent:requestConfirmation', expect.objectContaining({
            diffData: expect.objectContaining({ oldContent: '' })
        }));

        if (confirmationCallback) {
            confirmationCallback({ toolCallId, decision: 'allow' });
        }
        await executePromise;
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
    });
});
