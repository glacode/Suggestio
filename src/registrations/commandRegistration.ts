// registrations/commandRegistration.ts
import * as vscode from 'vscode';
import { editGlobalConfig } from '../config/editGlobalConfig.js';
import { Config } from '../types.js';
import { handleUpdateApiKeyCommand, handleDeleteApiKeyCommand } from '../config/secretManager.js';
import { extractApiKeyPlaceholders } from '../config/apiKeyPlaceholders.js';
import { ChatWebviewViewProvider } from '../chat/chatWebviewViewProvider.js';

interface INewChatCapable {
  newChat(): void;
}

export function registerCommands(context: vscode.ExtensionContext, config: Config, newChatCapable: INewChatCapable) {
  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.editGlobalConfig", () =>
      editGlobalConfig(context, config)
    )
  );

  const apiKeyPlaceholders = extractApiKeyPlaceholders(config);

  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.updateApiKey", () =>
      handleUpdateApiKeyCommand(context, apiKeyPlaceholders)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.deleteApiKey", () =>
      handleDeleteApiKeyCommand(context, apiKeyPlaceholders)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.openChat', () => {
      vscode.commands.executeCommand('suggestio.chat.view.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.newChat', () => {
      (newChatCapable as ChatWebviewViewProvider).newChat();
    })
  );

  // Toggle inline completion UI context (minimal implementation)
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.enableInlineCompletion', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.disableInlineCompletion', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', false);
    })
  );
}
