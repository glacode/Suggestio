import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { getConfigContainer } from './config/config.js';
import { getActiveProvider } from './providers/providerFactory.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';
import './chat/activeEditorTracker.js';
import { ChatViewProvider } from './chat/chatViewProvider.js';
import { ConfigContainer } from './config/types.js';

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const configContainer: ConfigContainer = await getConfigContainer(context);
  const activeProvider = getActiveProvider(configContainer.config);
  if (!activeProvider) { return; }

  const chatProvider = new ChatViewProvider(context, configContainer.config);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, activeProvider);
  registerCommands(context, configContainer.config);
}

export function deactivate() { }
