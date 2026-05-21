// registrations/commandRegistration.ts
import * as vscode from 'vscode';
import {
  IConfig,
  IWindowProvider,
  ICommandAutoAcceptManager
} from '../types.js';
import { handleUpdateApiKeyCommand, handleDeleteApiKeyCommand, SecretManager } from '../config/secretManager.js';
import { extractApiKeyPlaceholders } from '../config/apiKeyPlaceholders.js';
import { IEventBus } from '../utils/eventBus.js';

interface INewChatCapable {
  newChat(): void;
  showSettings?: () => void;
  showHistory?: () => void;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  config: IConfig,
  newChatCapable: INewChatCapable,
  eventBus: IEventBus,
  windowProvider: IWindowProvider,
  secretManager: SecretManager,
  autoAcceptManager: ICommandAutoAcceptManager
) {
  // Opens the standard VS Code Settings UI, filtered to Suggestio settings.
  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.editGlobalConfig", () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'suggestio')
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
      autoAcceptManager.clear();
      newChatCapable.newChat();
    })
  );

  // Enables inline completion by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.enableInlineCompletion', async () => {
      await vscode.workspace.getConfiguration('suggestio').update('inlineCompletion.enabled', true, vscode.ConfigurationTarget.Workspace);
    })
  );

  // Disables inline completion by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.disableInlineCompletion', async () => {
      await vscode.workspace.getConfiguration('suggestio').update('inlineCompletion.enabled', false, vscode.ConfigurationTarget.Workspace);
     })
  );

  // Enables auto-accept edits by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.enableAutoAcceptEdits', () => {
      eventBus.emit('autoAcceptEditsToggled', true);
    })
  );

  // Disables auto-accept edits by setting a VS Code context and notifying the extension via the event bus.
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.disableAutoAcceptEdits', () => {
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

  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.showChatHistory', () => {
      if (newChatCapable && typeof newChatCapable.showHistory === 'function') {
        newChatCapable.showHistory();
      }
    })
  );
}