// registrations/completionRegistration.ts
import * as vscode from 'vscode';
import { provideInlineCompletionItems } from '../completion/completionProvider.js';
import { ProviderConfig } from '../config/types.js';
import { getConfig } from '../config/config.js';

export async function registerCompletionProvider(
  context: vscode.ExtensionContext,
  activeProvider: ProviderConfig,
) {
  const config = await getConfig();
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: (doc, pos, ctx, token) =>
      provideInlineCompletionItems(activeProvider, config, doc, pos, ctx, token)
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: '*', language: '*' },
      provider
    )
  );
}
