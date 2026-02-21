// registrations/commandRegistration.ts
import * as vscode from 'vscode';
import { editGlobalConfig } from '../config/editGlobalConfig.js';
import { 
  IConfig, 
  IPathResolver, 
  IDirectoryReader, 
  IDirectoryCreator, 
  IFileContentWriter, 
  IWindowProvider, 
  IDocumentOpener 
} from '../types.js';
import { handleUpdateApiKeyCommand, handleDeleteApiKeyCommand, SecretManager } from '../config/secretManager.js';
import { extractApiKeyPlaceholders } from '../config/apiKeyPlaceholders.js';
import { IEventBus } from '../utils/eventBus.js';

interface INewChatCapable {
  newChat(): void;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  config: IConfig,
  newChatCapable: INewChatCapable,
  eventBus: IEventBus,
  pathResolver: IPathResolver,
  directoryReader: IDirectoryReader,
  directoryCreator: IDirectoryCreator,
  fileWriter: IFileContentWriter,
  documentOpener: IDocumentOpener,
  windowProvider: IWindowProvider,
  secretManager: SecretManager
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.editGlobalConfig", () =>
      editGlobalConfig(
        context,
        config,
        pathResolver,
        directoryReader,
        directoryCreator,
        fileWriter,
        documentOpener,
        windowProvider
      )
    )
  );

  const apiKeyPlaceholders = extractApiKeyPlaceholders(config);

  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.updateApiKey", () =>
      handleUpdateApiKeyCommand(secretManager, windowProvider, apiKeyPlaceholders)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.deleteApiKey", () =>
      handleDeleteApiKeyCommand(secretManager, windowProvider, apiKeyPlaceholders)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.openChat', () => {
      vscode.commands.executeCommand('suggestio.chat.view.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.newChat', () => {
      newChatCapable.newChat();
    })
  );

  // Toggle inline completion UI context (minimal implementation)
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.enableInlineCompletion', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', true);
      // Notify other parts of the extension so they can update their behavior (mirrors modelChanged flow)
      eventBus.emit('inlineCompletionToggled', true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.disableInlineCompletion', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', false);
      // Notify other parts of the extension so they can update their behavior (mirrors modelChanged flow)
      eventBus.emit('inlineCompletionToggled', false);
    })
  );
}