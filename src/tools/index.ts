import { IWorkspaceProvider, IPathResolver, IFileContentReader, IFileContentWriter, IEventBus, IIgnoreManager, ICommandExecutor, ICommandValidator, IWorkspaceScanner } from '../types.js';
import { ReadFileTool } from './readFileTool.js';
import { WriteFileTool } from './writeFileTool.js';
import { ListFilesTool } from './listFilesTool.js';
import { GrepSearchTool } from './grepSearchTool.js';
import { RunCommandTool } from './runCommandTool.js';

export function getTools(
    workspaceProvider: IWorkspaceProvider,
    fileReader: IFileContentReader,
    fileWriter: IFileContentWriter,
    pathResolver: IPathResolver,
    eventBus: IEventBus,
    ignoreManager: IIgnoreManager,
    workspaceScanner: IWorkspaceScanner,
    commandExecutor: ICommandExecutor,
    commandValidator: ICommandValidator
) {
    return [
        new ReadFileTool(workspaceProvider, fileReader, pathResolver, eventBus, ignoreManager, false),
        new WriteFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager),
        new ListFilesTool(workspaceProvider, pathResolver, workspaceScanner),
        new GrepSearchTool(workspaceProvider, fileReader, pathResolver, eventBus, workspaceScanner),
        new RunCommandTool(workspaceProvider, commandExecutor, eventBus, commandValidator)
    ];
}

export { ReadFileTool, WriteFileTool, ListFilesTool, GrepSearchTool, RunCommandTool };
