import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { readConfig } from './config/config.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';
import './chat/activeEditorTracker.js';
import { ChatViewProvider } from './chat/chatViewProvider.js';
import { ConfigContainer } from './config/types.js';
import { SecretManager } from './config/secretManager.js';
import { configProcessor } from './config/configProcessor.js';

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const secretManager = new SecretManager(context);
  const rawConfig = await readConfig(context);
  const configContainer: ConfigContainer = await configProcessor.processConfig(rawConfig, secretManager);

  const chatProvider = new ChatViewProvider(context, configContainer.config);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, configContainer.config);
  registerCommands(context, configContainer.config);
}

export function deactivate() { }
