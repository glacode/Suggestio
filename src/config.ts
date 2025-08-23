import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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

export function loadConfig(context: vscode.ExtensionContext): any {
  const configPath = getConfigPath(context);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    const activeProviderKey = config.activeProvider;
    const providers = config.providers;

    // 1. Check if the active provider configuration exists
    if (activeProviderKey && providers && providers[activeProviderKey]) {
      const activeProviderConfig = providers[activeProviderKey];

      // 2. Directly check if 'apiKey' exists and is a string
      if (activeProviderConfig.apiKey && typeof activeProviderConfig.apiKey === 'string') {
        
        // 3. Substitute the variable in the 'apiKey' field only
        activeProviderConfig.apiKey = (<string>(activeProviderConfig.apiKey)).replace(
          /\$\{(\w+)\}/g,
          (_, name) => process.env[name] ?? ''
        );
      }
    }

    return config;
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load config.json: ${err}`);
    return {};
  }
}