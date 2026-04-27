import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ReplaceTextTool } from "../../src/tools/replaceTextTool.js";
import { IWorkspaceProvider, IPathResolver, IFileContentReader, IFileContentWriter, IEventBus, IIgnoreManager, IUserConfirmationPayload } from "../../src/types.js";
import { AGENT_MESSAGES } from "../../src/constants/messages.js";
import { createMockPathResolver, createMockFileContentReader, createMockWorkspaceProvider, createMockEventBus, createMockIgnoreManager, createMockFileContentWriter } from "../testUtils.js";

describe("ReplaceTextTool", () => {
    let tool: ReplaceTextTool;
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

        tool = new ReplaceTextTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager);
    });

    it("should have the correct definition", () => {
        expect(tool.definition.name).toBe("replace_text");
        expect(tool.definition.description).toContain("Replace a specific block of text");
    });

    it("should successfully replace a unique string", async () => {
        const filePath = "test.ts";
        const oldContent = "line1\nline2\nline3";
        const oldString = "line2";
        const newString = "line2-replaced";
        const expectedNewContent = "line1\nline2-replaced\nline3";
        const toolCallId = "call1";

        fileReader.read.mockReturnValue(oldContent);

        let userResponseCallback: (payload: IUserConfirmationPayload) => void;
        eventBus.on.mockImplementation((event: string, cb: any) => {
            if (event === "user:confirmationResponse") {
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

        const result = await tool.execute({ path: filePath, old_string: oldString, new_string: newString }, undefined, toolCallId);

        expect(result.success).toBe(true);
        expect(fileWriter.write).toHaveBeenCalledWith(expect.stringContaining(filePath), expectedNewContent);
        expect(eventBus.emit).toHaveBeenCalledWith("agent:requestConfirmation", expect.objectContaining({
            diffData: {
                oldContent,
                newContent: expectedNewContent,
                filePath
            }
        }));
    });

    it("should return error if old_string is not found", async () => {
        const filePath = "test.ts";
        const oldContent = "line1\nline2\nline3";
        const oldString = "non-existent";

        fileReader.read.mockReturnValue(oldContent);

        const result = await tool.execute({ path: filePath, old_string: oldString, new_string: "new" });

        expect(result.success).toBe(false);
        expect(result.content).toContain("old_string was not found");
        expect(fileWriter.write).not.toHaveBeenCalled();
    });

    it("should return error if old_string is ambiguous", async () => {
        const filePath = "test.ts";
        const oldContent = "line1\nline2\nline2\nline3";
        const oldString = "line2";

        fileReader.read.mockReturnValue(oldContent);

        const result = await tool.execute({ path: filePath, old_string: oldString, new_string: "new" });

        expect(result.success).toBe(false);
        expect(result.content).toContain("Multiple occurrences of old_string found");
        expect(fileWriter.write).not.toHaveBeenCalled();
    });

    it("should return error if file cannot be read", async () => {
        const filePath = "test.ts";
        fileReader.read.mockReturnValue(undefined);

        const result = await tool.execute({ path: filePath, old_string: "old", new_string: "new" });

        expect(result.success).toBe(false);
        expect(result.content).toContain("Could not read file");
    });

    it("should return error if path is outside workspace", async () => {
        workspaceProvider.rootPath.mockReturnValue(mockRootPath);
        const result = await tool.execute({ path: "../test.ts", old_string: "old", new_string: "new" });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_OUTSIDE_WORKSPACE);
    });

    it("should return error if path is ignored", async () => {
        ignoreManager.shouldIgnore.mockResolvedValue(true);
        const result = await tool.execute({ path: "test.ts", old_string: "old", new_string: "new" });
        expect(result.success).toBe(false);
        expect(result.content).toBe(AGENT_MESSAGES.ERROR_PATH_IGNORED("test.ts"));
    });
});
