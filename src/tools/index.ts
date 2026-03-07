import { IWorkspaceProvider, IPathResolver, IToolImplementation, IFileContentReader, IFileContentWriter, IEventBus, IIgnoreManager, IWorkspaceScanner } from '../types.js';
import { ReadFileTool } from './readFileTool.js';
import { EditFileTool } from './editFileTool.js';
import { ListFilesTool } from './listFilesTool.js';

export function getTools(
    workspaceProvider: IWorkspaceProvider,
    fileReader: IFileContentReader,
    fileWriter: IFileContentWriter,
    pathResolver: IPathResolver,
    eventBus: IEventBus,
    ignoreManager: IIgnoreManager,
    workspaceScanner: IWorkspaceScanner
): IToolImplementation[] {
    return [
        new ListFilesTool(workspaceProvider, pathResolver, workspaceScanner),
        new ReadFileTool(workspaceProvider, fileReader, pathResolver, eventBus, ignoreManager),
        new EditFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus, ignoreManager)
    ];
}

export { ReadFileTool, EditFileTool, ListFilesTool };
