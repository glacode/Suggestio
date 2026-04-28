import { IWorkspaceProvider, IPathResolver, IFileContentReader, IFileContentWriter, IEventBus, IIgnoreManager, ICommandExecutor, ICommandValidator, IWorkspaceScanner, IConfig } from '../types.js';
import { ReadFileTool } from './readFileTool.js';
import { WriteFileTool } from './writeFileTool.js';
import { ReplaceTextTool } from './replaceTextTool.js';
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
    commandValidator: ICommandValidator,
    config: IConfig
) {
    return [
        new ReadFileTool(workspaceProvider, fileReader, pathResolver, eventBus, ignoreManager, false),
        new WriteFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager, config),
        new ReplaceTextTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager, config),
        new ListFilesTool(workspaceProvider, pathResolver, workspaceScanner),
        new GrepSearchTool(workspaceProvider, fileReader, pathResolver, eventBus, workspaceScanner, false),
        new RunCommandTool(workspaceProvider, commandExecutor, eventBus, commandValidator)
    ];
}

export { ReadFileTool, WriteFileTool, ReplaceTextTool, ListFilesTool, GrepSearchTool, RunCommandTool };
