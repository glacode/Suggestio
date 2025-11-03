import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigContainer } from './types.js';
import { getOrRequestAPIKey } from './secretManager.js';
import { processConfig, SecretManager } from './configProcessor.js';

let configContainer: ConfigContainer | null = null;

function getConfigPath(context: vscode.ExtensionContext): string {
  const workspaceConfig = vscode.workspace.workspaceFolders?.[0]
    ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'suggestio.config.json')
    : null;

  if (workspaceConfig && fs.existsSync(workspaceConfig)) { return workspaceConfig; }

  const globalConfig = path.join(context.globalStorageUri.fsPath, 'config.json');
  if (fs.existsSync(globalConfig)) { return globalConfig; }

  return path.join(context.extensionPath, 'config.json');
}

/**
 * Returns the singleton config. Loads it if not already loaded.
 * The context is only used on the first call.
 */
export async function getConfigContainer(context?: vscode.ExtensionContext): Promise<ConfigContainer> {
  if (configContainer) {
    return configContainer;
  }

  if (!context) {
    throw new Error('Context must be provided on first call to getConfig');
  }

  const configPath = getConfigPath(context);

  try {
    const raw = fs.readFileSync(configPath, 'utf8');

    const secretManager: SecretManager = {
      getOrRequestAPIKey: (key: string) => getOrRequestAPIKey(context, key)
    };

    configContainer = await processConfig(raw, secretManager);
    return configContainer;
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load config.json: ${err}`);
    configContainer = {
      config: {
        activeProvider: '',
        providers: {},
        anonymizer: { enabled: false, words: [] }
      }
    };
    return configContainer;
  }
}

/**
 * Forces reload of the config (optional). Requires context.
 */
export async function reloadConfig(context: vscode.ExtensionContext): Promise<ConfigContainer> {
  configContainer = null;
  return await getConfigContainer(context);
}
