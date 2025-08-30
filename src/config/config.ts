import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './types.js';
import { getOrRequestAPIKey } from './secretManager.js';

export function getConfigPath(context: vscode.ExtensionContext): string {
  const workspaceConfig = vscode.workspace.workspaceFolders?.[0]
    ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'suggestio.config.json')
    : null;

  if (workspaceConfig && fs.existsSync(workspaceConfig)) {
    return workspaceConfig;
  }

  const globalConfig = path.join(context.globalStorageUri.fsPath, 'config.json');
  if (fs.existsSync(globalConfig)) {
    return globalConfig;
  }

  // fallback to extension's default config
  return path.join(context.extensionPath, 'config.json');
}

async function loadAPIKey(context: vscode.ExtensionContext, activeProviderKey: any, providers: any) {
  if (activeProviderKey && providers && providers[activeProviderKey]) {
    const activeProviderConfig = providers[activeProviderKey];

    if (activeProviderConfig.apiKey && typeof activeProviderConfig.apiKey === 'string') {
      let apiKeyValue: string = <string>activeProviderConfig.apiKey;

      // Substitute environment variables
      apiKeyValue = apiKeyValue.replace(
        /\$\{(\w+)\}/g,
        (_, name) => process.env[name] ?? ''
      );

      // If API key still contains variables or is empty, get from secret or prompt user
      if (apiKeyValue.includes('${') || apiKeyValue.trim() === '') {
        activeProviderConfig.apiKey = await getOrRequestAPIKey(context, activeProviderKey);
      } else {
        activeProviderConfig.apiKey = apiKeyValue;
      }
    }
  }
}

export async function loadConfig(context: vscode.ExtensionContext): Promise<Config> {
  const configPath = getConfigPath(context);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    const activeProviderKey = config.activeProvider;
    const providers = config.providers;

    await loadAPIKey(context, activeProviderKey, providers);

    return config;
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load config.json: ${err}`);
    return {
      activeProvider: '',
      providers: {},
      anonymizer: {
        enabled: false,
        words: []
      }
    };
  }
}