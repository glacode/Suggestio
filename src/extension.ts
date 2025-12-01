import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { readConfig } from './config/config.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';
import './chat/activeEditorTracker.js';
import { ChatWebviewViewProvider } from './chat/chatWebviewViewProvider.js';
import { ChatResponder } from './chat/chatResponder.js';
import { buildContext } from './chat/context.js';
import { getChatWebviewContent } from './chat/chatWebviewContent.js';
import { ConfigContainer } from './config/types.js';
import { SecretManager } from './config/secretManager.js';
import { configProcessor } from './config/configProcessor.js';
import { ConversationHistory } from './chat/conversationHistory.js'; // New import


export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const secretManager = new SecretManager(context);
  const rawConfig = await readConfig(context);
  const configContainer: ConfigContainer = await configProcessor.processConfig(rawConfig, secretManager);

  const conversationHistory = new ConversationHistory(); // Owned by extension.ts
  const chatHistoryManager = conversationHistory; // Now directly use conversationHistory as it implements IChatHistoryManager

  const logicHandler = new ChatResponder(
    configContainer.config,
    log,
    chatHistoryManager // Injected fully capable history manager
  );
  const providerAccessor = {
    getModels: () => Object.values(configContainer.config.providers).map(p => p.model),
    getActiveModel: () => configContainer.config.providers[configContainer.config.activeProvider].model,
  };

  const chatWebviewViewProvider : vscode.WebviewViewProvider = new ChatWebviewViewProvider({
    extensionContext: context,
    providerAccessor,
    logicHandler,
    chatHistoryManager: chatHistoryManager, // Use the shared instance
    buildContext,
    getChatWebviewContent,
    vscodeApi: vscode
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatWebviewViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, configContainer.config);
  registerCommands(context, configContainer.config);
}

export function deactivate() { }
