import { IWorkspaceProvider, IDirectoryReader, IPathResolver, IToolImplementation, IFileContentReader, IFileContentWriter, IEventBus, IIgnoreManager } from '../types.js';
import { ReadFileTool } from './readFileTool.js';
import { EditFileTool } from './editFileTool.js';
import { ListFilesTool } from './listFilesTool.js';

export function getTools(
    workspaceProvider: IWorkspaceProvider,
    directoryProvider: IDirectoryReader,
    fileReader: IFileContentReader,
    fileWriter: IFileContentWriter,
    pathResolver: IPathResolver,
    eventBus: IEventBus,
    ignoreManager: IIgnoreManager
): IToolImplementation[] {
    return [
        new ListFilesTool(workspaceProvider, directoryProvider, pathResolver, ignoreManager),
        new ReadFileTool(workspaceProvider, fileReader, pathResolver, eventBus),
        new EditFileTool(workspaceProvider, fileReader, fileWriter, pathResolver, eventBus)
    ];
}

export { ReadFileTool, EditFileTool, ListFilesTool };
