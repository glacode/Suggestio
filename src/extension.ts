import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { loadConfig } from './config.js';
import { getActiveProvider } from './providers/providerFactory.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const config = await loadConfig(context);
  const activeProvider = await getActiveProvider(config);
  if (!activeProvider) { return; }

  registerCompletionProvider(context, activeProvider, config);
  registerCommands(context, config);
}

export function deactivate() { }
