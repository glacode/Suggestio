// registrations/completionRegistration.ts
import * as vscode from 'vscode';
import { provideInlineCompletionItems } from '../completion/completionProvider.js';
import { Provider } from '../providers/providerFactory.js';
import { Config } from '../config/config.js';

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  activeProvider: Provider,
  config: Config
) {
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
