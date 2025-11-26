import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { readConfig } from './config/config.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';
import './chat/activeEditorTracker.js';
import { ChatViewProvider } from './chat/chatViewProvider.js';
import { ChatLogicHandler } from './chat/chatLogicHandler.js';
import { buildContext } from './chat/context.js';
import { getChatWebviewContent } from './chat/chatWebviewContent.js';
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

  const logicHandler = new ChatLogicHandler(configContainer.config, log);
  const providerAccessor = {
    getModels: () => Object.values(configContainer.config.providers).map(p => p.model),
    getActiveModel: () => configContainer.config.providers[configContainer.config.activeProvider].model,
  };

  const chatProvider = new ChatViewProvider({
    extensionContext: context,
    providerAccessor,
    logicHandler,
    buildContext,
    getChatWebviewContent,
    vscodeApi: vscode
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, configContainer.config);
  registerCommands(context, configContainer.config);
}

export function deactivate() { }
