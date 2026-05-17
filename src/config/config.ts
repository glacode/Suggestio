/**
 * This module is responsible for identifying and reading the raw configuration files
 * from the layers supported by Suggestio:
 * 1. Default: Built-in presets provided by the extension.
 * 2. Workspace: Project-specific overrides stored in the workspace root.
 * 
 * Note: Global user preferences are managed via standard VS Code settings.
 */
import { 
    IExtensionContextMinimal, 
    IDirectoryReader, 
    IFileContentReader, 
    IWindowProvider, 
    IWorkspaceProvider, 
    IPathResolver,
    IRawConfigs
} from '../types.js';
import { CONFIG_MESSAGES } from '../constants/messages.js';

/**
 * Determines the path to the workspace-specific configuration file.
 * Typically located at the root of the project as 'suggestio.config.json'.
 */
function getWorkspaceConfigPath(
    workspaceProvider: IWorkspaceProvider,
    pathResolver: IPathResolver
): string | null {
  const rootPath = workspaceProvider.rootPath();
  return rootPath ? pathResolver.join(rootPath, 'suggestio.config.json') : null;
}

/**
 * Determines the path to the default 'factory' configuration file.
 * This file is packaged within the extension and should be treated as read-only.
 */
function getDefaultConfigPath(
    context: IExtensionContextMinimal,
    pathResolver: IPathResolver
): string {
  return pathResolver.join(context.extensionUri?.fsPath || '', 'config.json');
}

/**
 * Reads the raw JSON content from available configuration layers.
 * 
 * The layers are collected and returned as a single IRawConfigs object, 
 * allowing the ConfigProcessor to perform a merged initialization.
 * 
 * Merging priority (handled downstream): Default < VS Code Settings < Workspace.
 * 
 * @returns An object containing the raw JSON strings for each found layer.
 */
export async function readConfig(
    context: IExtensionContextMinimal,
    workspaceProvider: IWorkspaceProvider,
    fileProvider: IFileContentReader,
    directoryProvider: IDirectoryReader,
    windowProvider: IWindowProvider,
    pathResolver: IPathResolver
): Promise<IRawConfigs> {
    const configs: IRawConfigs = { default: '' };

    // 1. Read Default Config (Mandatory)
    // This provides the fallback profiles and base settings for the extension.
    const defaultPath = getDefaultConfigPath(context, pathResolver);
    try {
        const content = fileProvider.read(defaultPath);
        if (content === undefined) {
             throw new Error(CONFIG_MESSAGES.FILE_NOT_FOUND(defaultPath));
        }
        configs.default = content;
    } catch (err) {
        windowProvider.showErrorMessage(CONFIG_MESSAGES.LOAD_FAILED(`Default config: ${err}`));
        // Fallback to a minimal valid JSON to allow the extension to start
        configs.default = JSON.stringify({ profiles: {}, anonymizer: { enabled: false, words: [] } });
    }

    // 2. Read Workspace Config (Optional)
    // This allows project-specific overrides (e.g., pointing to a local Ollama instance).
    const workspacePath = getWorkspaceConfigPath(workspaceProvider, pathResolver);
    if (workspacePath && directoryProvider.exists(workspacePath)) {
        try {
            configs.workspaceJsonConfigFile = fileProvider.read(workspacePath);
        } catch (err) {
            windowProvider.showErrorMessage(CONFIG_MESSAGES.LOAD_FAILED(`Workspace config: ${err}`));
        }
    }

    return configs;
}