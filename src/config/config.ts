import { 
    IExtensionContextMinimal, 
    IDirectoryReader, 
    IFileContentReader, 
    IWindowProvider, 
    IWorkspaceProvider, 
    IPathResolver 
} from '../types.js';

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
             throw new Error(`File not found or unreadable: ${configPath}`);
        }
        return content;
    } catch (err) {
        windowProvider.showErrorMessage(`Failed to load config.json: ${err}`);
        return JSON.stringify({
            activeProvider: '',
            providers: {},
            anonymizer: { enabled: false, words: [] }
        });
    }
}