import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { WriteFileTool } from "../../src/tools/writeFileTool.js";
import { IWorkspaceProvider, IPathResolver, IFileContentReader, IFileContentWriter, IEventBus, IIgnoreManager, IUserConfirmationPayload, IAutoAcceptProvider } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver, createMockFileContentReader, createMockWorkspaceProvider, createMockEventBus, createMockIgnoreManager, createMockFileContentWriter } from "../testUtils.js";

describe("WriteFileTool", () => {
    let tool: WriteFileTool;
    let workspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let fileReader: jest.Mocked<IFileContentReader>;
    let fileWriter: jest.Mocked<IFileContentWriter>;
    let pathResolver: jest.Mocked<IPathResolver>;
    let eventBus: jest.Mocked<IEventBus>;
    let ignoreManager: jest.Mocked<IIgnoreManager>;
    const mockRootPath = "/root";

    beforeEach(() => {
        workspaceProvider = createMockWorkspaceProvider();
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        
        fileReader = createMockFileContentReader();
        fileWriter = createMockFileContentWriter();
        pathResolver = createMockPathResolver();
        eventBus = createMockEventBus();
        ignoreManager = createMockIgnoreManager();
        ignoreManager.shouldIgnore.mockResolvedValue(false);

        tool = new WriteFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager);
    });

    it("should have the correct definition", () => {
        expect(tool.definition.name).toBe("write_file");
        expect(tool.definition.description).toContain("Write the full content to a file");
    });

    it("should return error if no workspace is open", async () => {
        workspaceProvider.rootPath.mockReturnValue(undefined);
        const result = await tool.execute({ path: "test.ts", content: "test" });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_NO_WORKSPACE);
    });

    it("should return error if path is outside workspace", async () => {
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        // pathResolver join/resolve will use real path.join/resolve via mock
        const result = await tool.execute({ path: "../test.ts", content: "test" });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
    });

    it("should return error if path is ignored", async () => {
        ignoreManager.shouldIgnore.mockResolvedValue(true);

        const result = await tool.execute({ path: "test.ts", content: "test" });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_IGNORED("test.ts"));
    });

    it("should request confirmation and write if allowed", async () => {
        const filePath = "test.ts";
        const content = "new content";
        const toolCallId = "call1";
        fileReader.read.mockReturnValue("old content");

        // Mock eventBus to simulate user confirmation
        // Capture the callback registered by the tool so we can trigger it later
        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === "user:confirmationResponse") {
                userResponseCallback = cb;
            }
            return { dispose: () => { } };
        });

        // Simulating the user's decision
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

        const result = await tool.execute({ path: filePath, content }, undefined, toolCallId);

        expect(eventBus.emit).toHaveBeenCalledWith("agent:requestConfirmation", expect.objectContaining({
            toolCallId,
            message: expect.stringContaining(filePath),
            diffData: expect.objectContaining({
                oldContent: "old content",
                newContent: content,
                filePath: filePath
            })
        }));
        expect(fileWriter.write).toHaveBeenCalledWith(expect.stringContaining(filePath), content);
        expect(result.success).toBe(true);
        expect(result.content).toContain(`Successfully wrote ${filePath}`);
    });

    it("should proceed if user chooses 'always-allow'", async () => {
        const filePath = "test.ts";
        const content = "new content";
        const toolCallId = "call1";
        fileReader.read.mockReturnValue("old content");

        // Capture the callback registered by the tool so we can trigger it later
        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === "user:confirmationResponse") {
                userResponseCallback = cb;
            }
            return { dispose: () => { } };
        });

        // When the tool emits 'agent:requestConfirmation', we simulate the user clicking 'Always Allow'
        eventBus.emit.mockImplementation((event: string, payload: any) => {
            if (event === 'agent:requestConfirmation' && payload.toolCallId === toolCallId) {
                setImmediate(() => {
                    if (userResponseCallback) {
                        userResponseCallback({ toolCallId, decision: 'always-allow' });
                    }
                });
            }
            return true;
        });

        const result = await tool.execute({ path: filePath, content }, undefined, toolCallId);

        expect(result.success).toBe(true);
        expect(fileWriter.write).toHaveBeenCalledWith(expect.stringContaining(filePath), content);
    });

    it("should return error if user denies confirmation", async () => {
        const filePath = "test.ts";
        const toolCallId = "call1";

        // Capture the callback registered by the tool so we can trigger it later
        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === "user:confirmationResponse") {
                userResponseCallback = cb;
            }
            return { dispose: () => { } };
        });

        // Simulating the user's decision
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

        const result = await tool.execute({ path: filePath, content: "new" }, undefined, toolCallId);

        expect(result.success).toBe(false);
        expect(result.content).toContain(`User denied permission to write to file ${filePath}`);
        expect(fileWriter.write).not.toHaveBeenCalled();
    });

    it("should bypass confirmation if autoAcceptEdits is enabled", async () => {
        const filePath = "test.ts";
        const content = "new content";
        const toolCallId = "call1";
        const autoAcceptProvider: IAutoAcceptProvider = { autoAcceptEdits: true };
        
        tool = new WriteFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager, autoAcceptProvider);

        const result = await tool.execute({ path: filePath, content }, undefined, toolCallId);

        expect(eventBus.emit).not.toHaveBeenCalledWith("agent:requestConfirmation", expect.anything());
        expect(fileWriter.write).toHaveBeenCalledWith(expect.stringContaining(filePath), content);
        expect(result.success).toBe(true);
    });
});
