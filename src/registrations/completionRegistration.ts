// registrations/completionRegistration.ts
import * as vscode from 'vscode';
import { provideInlineCompletionItems } from '../completion/completionProvider.js';
import { Config } from '../types.js';
import { IgnoreManager } from '../chat/ignoreManager.js';

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  config: Config,
  ignoreManager: IgnoreManager,
) {
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: async (doc, pos, _ctx, token) => {
      const result = await provideInlineCompletionItems(
        config.llmProviderForInlineCompletion,
        config,
        ignoreManager,
        doc,
        pos,
        _ctx,
        token
      );

      return new vscode.InlineCompletionList(
        result.items.map(item => {
          const vscItem = new vscode.InlineCompletionItem(item.insertText);
          if (item.range) {
            vscItem.range = new vscode.Range(
              new vscode.Position(item.range.start.line, item.range.start.character),
              new vscode.Position(item.range.end.line, item.range.end.character)
            );
          }
          return vscItem;
        })
      );
    }
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: '*', language: '*' },
      provider
    )
  );
}
