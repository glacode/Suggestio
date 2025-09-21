import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './types.js';
import { getOrRequestAPIKey } from './secretManager.js';
import { processConfig, SecretManager } from './configProcessor.js';

let cachedConfig: Config | null = null;

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
export async function getConfig(context?: vscode.ExtensionContext): Promise<Config> {
  if (cachedConfig) {
    return cachedConfig;
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

    cachedConfig = await processConfig(raw, secretManager);
    return cachedConfig;
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load config.json: ${err}`);
    cachedConfig = {
      activeProvider: '',
      providers: {},
      anonymizer: { enabled: false, words: [] }
    };
    return cachedConfig;
  }
}

/**
 * Forces reload of the config (optional). Requires context.
 */
export async function reloadConfig(context: vscode.ExtensionContext): Promise<Config> {
  cachedConfig = null;
  return getConfig(context);
}
