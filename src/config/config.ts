import { 
    IExtensionContextMinimal, 
    IDirectoryReader, 
    IFileContentReader, 
    IWindowProvider, 
    IWorkspaceProvider, 
    IPathResolver 
} from '../types.js';
import { CONFIG_MESSAGES } from '../constants/messages.js';

function getConfigPath(
    context: IExtensionContextMinimal,
    workspaceProvider: IWorkspaceProvider,
    directoryProvider: IDirectoryReader,
    pathResolver: IPathResolver
): string {
  const rootPath = workspaceProvider.rootPath();
  const workspaceConfig = rootPath
    ? pathResolver.join(rootPath, 'suggestio.config.json')
    : null;

  if (workspaceConfig && directoryProvider.exists(workspaceConfig)) { return workspaceConfig; }

  const globalConfig = context.globalStorageUri?.fsPath 
    ? pathResolver.join(context.globalStorageUri.fsPath, 'config.json')
    : null;
  if (globalConfig && directoryProvider.exists(globalConfig)) { return globalConfig; }

  return pathResolver.join(context.extensionUri?.fsPath || '', 'config.json');
}

export async function readConfig(
    context: IExtensionContextMinimal,
    workspaceProvider: IWorkspaceProvider,
    fileProvider: IFileContentReader,
    directoryProvider: IDirectoryReader,
    windowProvider: IWindowProvider,
    pathResolver: IPathResolver
): Promise<string> {
    const configPath = getConfigPath(context, workspaceProvider, directoryProvider, pathResolver);
    try {
        const content = fileProvider.read(configPath);
        if (content === undefined) {
             throw new Error(CONFIG_MESSAGES.FILE_NOT_FOUND(configPath));
        }
        return content;
    } catch (err) {
        windowProvider.showErrorMessage(CONFIG_MESSAGES.LOAD_FAILED(err));
        return JSON.stringify({
            activeProvider: '',
            providers: {},
            anonymizer: { enabled: false, words: [] }
        });
    }
}