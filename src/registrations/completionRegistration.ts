// registrations/completionRegistration.ts
import * as vscode from 'vscode';
import { provideInlineCompletionItems } from '../completion/completionProvider.js';
import { IConfigContainer, IEventBus } from '../types.js';
import { IgnoreManager } from '../chat/ignoreManager.js';

export function registerCompletionProvider(
  context: vscode.ExtensionContext,
  configContainer: IConfigContainer,
  ignoreManager: IgnoreManager,
  eventBus: IEventBus
) {
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: async (doc, pos, _ctx, token) => {
      const result = await provideInlineCompletionItems(
        configContainer.config.llmProviderForInlineCompletion,
        configContainer.config,
        ignoreManager,
        doc,
        pos,
        eventBus,
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
