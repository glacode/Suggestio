// registrations/commandRegistration.ts
import * as vscode from 'vscode';
import { editGlobalConfig } from '../config/editGlobalConfig.js';
import { Config } from '../config/types.js';
import { updateAPIKey, deleteSecret } from '../config/secretManager.js';

export function registerCommands(context: vscode.ExtensionContext, config: Config) {
  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.editGlobalConfig", () =>
      editGlobalConfig(context, config)
    )
  );

  // Update API Key command
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.updateApiKey', async () => {
      const provider = await vscode.window.showQuickPick(Object.keys(config.providers), {
        placeHolder: 'Select a provider to update its API key'
      });
      if (provider) {
        await updateAPIKey(context, provider);
      }
    })
  );

  // Delete API Key command
  context.subscriptions.push(
    vscode.commands.registerCommand('suggestio.deleteApiKey', async () => {
      const provider = await vscode.window.showQuickPick(Object.keys(config.providers), {
        placeHolder: 'Select a provider to delete its API key'
      });
      if (provider) {
        await deleteSecret(context, `${provider}_API_KEY`);
        vscode.window.showInformationMessage(`API key for ${provider} deleted.`);
      }
    })
  );
}
