// registrations/completionRegistration.ts
import * as vscode from 'vscode';
import { provideInlineCompletionItems } from '../completion/completionProvider.js';
import { getConfigContainer } from '../config/config.js';
import { llmProvider } from '../providers/llmProvider.js';
import { ConfigContainer } from '../config/types.js';

export async function registerCompletionProvider(
  context: vscode.ExtensionContext,
  activeProvider: llmProvider,
) {
  const configContainer: ConfigContainer = await getConfigContainer();
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: (doc, pos, ctx, token) =>
      provideInlineCompletionItems(activeProvider, configContainer.config, doc, pos, ctx, token)
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: '*', language: '*' },
      provider
    )
  );
}
