import { loadConfig } from '../config.js';
import * as vscode from 'vscode';

export async function getActiveProvider(context: vscode.ExtensionContext) {
  const config = await loadConfig(context);
  const activeProviderName = config.activeProvider;
  const activeProvider = config.providers?.[activeProviderName];

  if (!activeProvider) {
    vscode.window.showErrorMessage(`Provider "${activeProviderName}" not found in config.json`);
    return null;
  }
  return activeProvider;
}
