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
  showSettings?: () => void;
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
  // Opens the global configuration file (config.json) in the editor for manual modification.
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

  // Prompts the user to select an API key placeholder and then enter a new value for it, which is stored securely.
  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.updateApiKey", () =>
      handleUpdateApiKeyCommand(secretManager, windowProvider, apiKeyPlaceholders)
    )
  );

  // Prompts the user to select an API key placeholder to be removed from secure storage.
  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.deleteApiKey", () =>
      handleDeleteApiKeyCommand(secretManager, windowProvider, apiKeyPlaceholders)
    )
  );

  // Focuses the extension's chat view.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.openChat', () => {
      vscode.commands.executeCommand('suggestio.chat.view.focus');
    })
  );

  // Clears the current chat session and starts a new one.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.newChat', () => {
      newChatCapable.newChat();
    })
  );

  // Enables inline completion by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.enableInlineCompletion', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', true);
      // Notify other parts of the extension so they can update their behavior (mirrors modelChanged flow)
      eventBus.emit('inlineCompletionToggled', true);
    })
  );

  // Disables inline completion by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.disableInlineCompletion', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', false);
      // Notify other parts of the extension so they can update their behavior (mirrors modelChanged flow)
      eventBus.emit('inlineCompletionToggled', false);
    })
  );

  // Enables auto-accept edits by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.enableAutoAcceptEdits', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.autoAcceptEditsEnabled', true);
      eventBus.emit('autoAcceptEditsToggled', true);
    })
  );

  // Disables auto-accept edits by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.disableAutoAcceptEdits', () => {
      vscode.commands.executeCommand('setContext', 'suggestio.autoAcceptEditsEnabled', false);
      eventBus.emit('autoAcceptEditsToggled', false);
    })
  );

  // Allows the user to select an active completion profile from the configured profiles.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.selectCompletionProfile', async () => {
      // Prefer opening the in-webview settings overlay if the chat provider exposes it
      if (newChatCapable && typeof newChatCapable.showSettings === 'function') {
        try {
          newChatCapable.showSettings();
          return;
        } catch (e) {
          // fallback to quick pick below
        }
      }

      const profiles = Object.keys(config.profiles);
      if (profiles.length === 0) {
        windowProvider.showErrorMessage("No profiles found in configuration.");
        return;
      }

      const current = config.activeCompletionProfile || config.activeChatProfile;
      const items = profiles.map(id => ({
        label: id,
        description: config.profiles[id].model,
        detail: config.profiles[id].endpoint,
        picked: id === current
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Select profile for inline completion (Current: ${current})`,
      });

      if (selected) {
        eventBus.emit('completionProfileChanged', selected.label);
        windowProvider.showInformationMessage(`Inline completion profile set to: ${selected.label}`);
      }
    })
  );
}