import './env.js';

import * as vscode from 'vscode';
import { buildPrompt } from './promptBuilder/promptBuilder.js';
import { debounce } from './completion/debounceManager.js';
import { getActiveProvider } from './providers/providerFactory.js';
import { fetchCompletion } from './completion/completionHandler.js';

let pendingResolve: ((items: vscode.InlineCompletionItem[]) => void) | null = null;
const DEBOUNCE_DELAY_MS = 1000;

export function activate(context: vscode.ExtensionContext) {
  console.log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const activeProvider = getActiveProvider(context);
  if (!activeProvider) {
    return;
  }

  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position) {
      return new Promise<vscode.InlineCompletionItem[]>((resolve) => {
        pendingResolve = resolve;

        debounce(async () => {
          const prompt = buildPrompt(document, position);
          const now = Date.now();
          console.log(`Seconds: ${Math.floor(now / 1000)}, Milliseconds: ${now % 1000}`);
          console.log("Prompt:", prompt);

          try {
            const items = await fetchCompletion(
              activeProvider.endpoint,
              activeProvider.apiKey,
              activeProvider.model,
              prompt,
              position
            );
            pendingResolve?.(items);
          } catch (err) {
            console.error("Error fetching completion:", err);
            pendingResolve?.([]);
          } finally {
            pendingResolve = null;
          }
        }, DEBOUNCE_DELAY_MS);
      });
    }
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [{ language: 'javascript' }, { language: 'typescript' }],
      provider
    )
  );
}

export function deactivate() {}
