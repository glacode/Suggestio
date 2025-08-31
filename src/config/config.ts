import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './types.js';
import { getOrRequestAPIKey } from './secretManager.js';
import { processConfig, SecretManager } from './configProcessor.js';

export function getConfigPath(context: vscode.ExtensionContext): string {
  const workspaceConfig = vscode.workspace.workspaceFolders?.[0]
    ? path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'suggestio.config.json')
    : null;

  if (workspaceConfig && fs.existsSync(workspaceConfig)) { return workspaceConfig; }

  const globalConfig = path.join(context.globalStorageUri.fsPath, 'config.json');
  if (fs.existsSync(globalConfig)) { return globalConfig; }

  return path.join(context.extensionPath, 'config.json');
}

export async function loadConfig(context: vscode.ExtensionContext): Promise<Config> {
  const configPath = getConfigPath(context);

  try {
    const raw = fs.readFileSync(configPath, 'utf8');

    // Inject a secret manager for VS Code
    const secretManager: SecretManager = {
      getOrRequestAPIKey: (key: string) => getOrRequestAPIKey(context, key)
    };

    return await processConfig(raw, secretManager);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load config.json: ${err}`);
    return {
      activeProvider: '',
      providers: {},
      anonymizer: { enabled: false, words: [] }
    };
  }
}
