import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { getConfig } from './config/config.js';
import { getActiveProvider } from './providers/providerFactory.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const config = await getConfig(context);
  const activeProvider = getActiveProvider(config);
  if (!activeProvider) { return; }

  registerCompletionProvider(context, activeProvider);
  registerCommands(context, config);
}

export function deactivate() { }
