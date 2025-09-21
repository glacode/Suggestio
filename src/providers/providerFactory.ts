import { Config } from '../config/types.js';
import * as vscode from 'vscode';

export function getActiveProvider(config: Config) {
  const activeProviderName = config.activeProvider;
  const activeProvider = config.providers?.[activeProviderName];

  if (!activeProvider) {
    vscode.window.showErrorMessage(`Provider "${activeProviderName}" not found in config.json`);
    return null;
  }
  return activeProvider;
}