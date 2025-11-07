// registrations/completionRegistration.ts
import * as vscode from 'vscode';
import { provideInlineCompletionItems } from '../completion/completionProvider.js';
import { Config } from '../config/types.js';

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  config: Config,
) {
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: (doc, pos, ctx, token) =>
      provideInlineCompletionItems(config.inlineCompletionProvider, config, doc, pos, ctx, token)
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: '*', language: '*' },
      provider
    )
  );
}
