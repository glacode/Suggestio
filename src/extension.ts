import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { getActiveProvider } from './providers/providerFactory.js';
import { loadConfig } from './config.js';
import { editGlobalConfig } from './config/editGlobalConfig.js';
import { provideInlineCompletionItems } from './completion/completionProvider.js'; // ⟵ NEW

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const config = await loadConfig(context);
  const activeProvider = await getActiveProvider(config);
  if (!activeProvider) { return; }

  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: (document, position, context, token) =>
      provideInlineCompletionItems(activeProvider, config, document, position, context, token)
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: '*', language: '*' },
      provider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.editGlobalConfig", () =>
      editGlobalConfig(context, config)
    )
  );
}

export function deactivate() { }
