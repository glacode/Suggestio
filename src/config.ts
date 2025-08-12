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

function substituteEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '');
  } else if (Array.isArray(obj)) {
    return obj.map(substituteEnvVars);
  } else if (typeof obj === 'object' && obj !== null) {
    const out: any = {};
    for (const key of Object.keys(obj)) {
      out[key] = substituteEnvVars(obj[key]);
    }
    return out;
  }
  return obj;
}

export function loadConfig(context: vscode.ExtensionContext): any {
  const configPath = getConfigPath(context);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return substituteEnvVars(parsed);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load config.json: ${err}`);
    return {};
  }
}
