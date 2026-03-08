import { IWorkspaceProvider, IPathResolver, IToolImplementation, IFileContentReader, IFileContentWriter, IEventBus, IIgnoreManager, IWorkspaceScanner, ICommandExecutor, ICommandValidator } from '../types.js';
import { ReadFileTool } from './readFileTool.js';
import { EditFileTool } from './editFileTool.js';
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
): IToolImplementation[] {
    return [
        new ListFilesTool(workspaceProvider, pathResolver, workspaceScanner),
        new ReadFileTool(workspaceProvider, fileReader, pathResolver, eventBus, ignoreManager),
        new EditFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager),
        new GrepSearchTool(workspaceProvider, fileReader, pathResolver, eventBus, workspaceScanner),
        new RunCommandTool(workspaceProvider, commandExecutor, eventBus, commandValidator)
    ];
}

export { ReadFileTool, EditFileTool, ListFilesTool, GrepSearchTool, RunCommandTool };
