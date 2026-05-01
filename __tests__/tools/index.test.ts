import { describe, it, expect, beforeEach } from "@jest/globals";
import { getTools } from "../../src/tools/index.js";
import { ReadFileTool, WriteFileTool, ReplaceTextTool, ListFilesTool, GrepSearchTool, RunCommandTool } from "../../src/tools/index.js";
import { createMockWorkspaceProvider, createMockFileContentReader, createMockFileContentWriter, createMockPathResolver, createMockEventBus, createMockIgnoreManager } from "../testUtils.js";
import { ICommandExecutor, ICommandValidator, IWorkspaceScanner, IWorkspaceProvider, IFileContentReader, IFileContentWriter, IPathResolver, IEventBus, IIgnoreManager, ICommandAutoAcceptManager } from "../../src/types.js";
import { jest } from "@jest/globals";

describe("Tools Index", () => {
    let workspaceProvider: jest.Mocked<IWorkspaceProvider>;
    let fileReader: jest.Mocked<IFileContentReader>;
    let fileWriter: jest.Mocked<IFileContentWriter>;
    let pathResolver: jest.Mocked<IPathResolver>;
    let eventBus: jest.Mocked<IEventBus>;
    let ignoreManager: jest.Mocked<IIgnoreManager>;
    let workspaceScanner: jest.Mocked<IWorkspaceScanner>;
    let commandExecutor: jest.Mocked<ICommandExecutor>;
    let commandValidator: jest.Mocked<ICommandValidator>;
    let autoAcceptManager: jest.Mocked<ICommandAutoAcceptManager>;

    beforeEach(() => {
        workspaceProvider = createMockWorkspaceProvider();
        fileReader = createMockFileContentReader();
        fileWriter = createMockFileContentWriter();
        pathResolver = createMockPathResolver();
        eventBus = createMockEventBus();
        ignoreManager = createMockIgnoreManager();
        workspaceScanner = { scan: jest.fn<(dirPath: string, options: { recursive: boolean }) => Promise<string[]>>() };
        commandExecutor = { execute: jest.fn<ICommandExecutor["execute"]>() };
        commandValidator = { validate: jest.fn<ICommandValidator["validate"]>() };
        autoAcceptManager = {
            allowCommand: jest.fn(),
            isAllowed: jest.fn(),
            clear: jest.fn(),
        };
    });

    it("should return all registered tools", () => {
        const tools = getTools(
            workspaceProvider,
            fileReader,
            fileWriter,
            pathResolver,
            eventBus,
            ignoreManager,
            workspaceScanner,
            commandExecutor,
            commandValidator,
            { autoAcceptEdits: false },
            autoAcceptManager
        );

        expect(tools).toHaveLength(6);
        expect(tools.some(t => t instanceof ReadFileTool)).toBe(true);
        expect(tools.some(t => t instanceof WriteFileTool)).toBe(true);
        expect(tools.some(t => t instanceof ReplaceTextTool)).toBe(true);
        expect(tools.some(t => t instanceof ListFilesTool)).toBe(true);
        expect(tools.some(t => t instanceof GrepSearchTool)).toBe(true);
        expect(tools.some(t => t instanceof RunCommandTool)).toBe(true);
    });

    it("should configure ReadFileTool with requireUserConfirmation = false", () => {
        const tools = getTools(
            workspaceProvider,
            fileReader,
            fileWriter,
            pathResolver,
            eventBus,
            ignoreManager,
            workspaceScanner,
            commandExecutor,
            commandValidator,
            { autoAcceptEdits: false },
            autoAcceptManager
        );

        const readFileTool = tools.find((t): t is ReadFileTool => t instanceof ReadFileTool);
        
        expect(readFileTool).toBeDefined();
        if (readFileTool) {
            expect(readFileTool.requireUserConfirmation).toBe(false);
        }
    });
});
