import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './types.js';

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
      let apiKeyValue : string = <string>activeProviderConfig.apiKey;

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

async function getOrRequestAPIKey(context: vscode.ExtensionContext, providerKey: string): Promise<string> {
  const secretKey = `${providerKey}_API_KEY`;
  
  // Try to retrieve from secrets first
  const storedApiKey = await getSecret(context, secretKey);
  
  if (storedApiKey) {
    return storedApiKey;
  }
  
  // If not found, prompt user
  const userApiKey = await promptForAPIKey(providerKey);
  
  if (userApiKey) {
    // Store the API key in secrets
    await storeSecret(context, secretKey, userApiKey);
    return userApiKey;
  } else {
    throw new Error(`API key for ${providerKey} is required for this feature to work.`);
  }
}

async function getSecret(context: vscode.ExtensionContext, key: string): Promise<string | undefined> {
  return await context.secrets.get(key);
}

async function storeSecret(context: vscode.ExtensionContext, key: string, value: string): Promise<void> {
  await context.secrets.store(key, value);
}

async function promptForAPIKey(providerKey: string): Promise<string | undefined> {
  return await vscode.window.showInputBox({
    prompt: `Enter your ${providerKey} API Key`,
    placeHolder: `Your ${providerKey} API key here...`,
    password: true,
    ignoreFocusOut: true
  });
}

export async function loadConfig(context: vscode.ExtensionContext): Promise<Config> {
  const configPath = getConfigPath(context);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    const activeProviderKey = config.activeProvider;
    const providers = config.providers;

    // 1. Check if the active provider configuration exists
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