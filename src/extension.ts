import './env.js';

import * as vscode from 'vscode';
import { buildPrompt } from './promptBuilder/promptBuilder.js';
import { debounce } from './completion/debounceManager.js';
import { getActiveProvider, Provider } from './providers/providerFactory.js';
import { fetchCompletion } from './completion/completionHandler.js';
import { Config, loadConfig } from './config.js';
import { getAnonymizer } from './anonymizer/anonymizer.js';

const DEBOUNCE_DELAY_MS = 500;

// Top-level helper function to handle cancellation
function handleCancellation(
  token: vscode.CancellationToken | undefined,
  resolve: (items: vscode.InlineCompletionItem[]) => void,
  stage: 'before' | 'after'
): boolean {
  if (token?.isCancellationRequested) {
    console.warn(`❌ Suggestio: Request cancelled ${stage} LLM call`);
    resolve([]);
    return true;
  }
  return false;
}

// Top-level named function to generate the debounced callback
function createDebounceCallback(
  activeProvider: Provider,
  config: Config,
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken | undefined,
  resolve: (items: vscode.InlineCompletionItem[]) => void
): () => void {
  return function performCompletion() {
    if (handleCancellation(token, resolve, 'before')) { return; }

    const prompt = buildPrompt(document, position);
    const now = Date.now();
    console.log(`Seconds: ${Math.floor(now / 1000)}, Milliseconds: ${now % 1000}`);
    console.log("Prompt:", prompt);

    const anonymizer = getAnonymizer(config);

    fetchCompletion(
      activeProvider.endpoint,
      activeProvider.apiKey,
      activeProvider.model,
      prompt,
      position,
      anonymizer
    )
      .then(function (items) {
        if (handleCancellation(token, resolve, 'after')) { return; }

        console.log('✅ Suggestio: Returning completion to VS Code');
        resolve(items);
      })
      .catch(function (err) {
        console.error("Error fetching completion:", err);
        resolve([]);
      });
  };
}

// Top-level function for providing inline completions
function provideInlineCompletionItems(
  activeProvider: Provider,
  config: Config,
  document: vscode.TextDocument,
  position: vscode.Position,
  _context: vscode.InlineCompletionContext,
  token?: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[]> {
  return new Promise<vscode.InlineCompletionItem[]>(function (resolve) {
    debounce(createDebounceCallback(activeProvider, config, document, position, token, resolve), DEBOUNCE_DELAY_MS);
  });
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");
  
  const config = await loadConfig(context);

  const activeProvider = await getActiveProvider(config);
  if (!activeProvider) {
    return;
  }

  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: function (document, position, context, token) {
      return provideInlineCompletionItems(activeProvider, config, document, position, context, token);
    }
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [{ language: 'javascript' }, { language: 'typescript' }],
      provider
    )
  );
}

export function deactivate() { }
