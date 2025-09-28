// completion/completionProvider.ts
import * as vscode from "vscode";
import { buildPrompt } from "../promptBuilder/promptBuilder.js";
import { getAnonymizer } from "../anonymizer/anonymizer.js";
import { debounce } from "./debounceManager.js";
import { handleCancellation } from "./cancellation.js";
import { log } from "../logger.js";
import { Config } from "../config/types.js";
import { llmProvider } from "../providers/llmProvider.js";

const DEBOUNCE_DELAY_MS = 1000;

function createDebounceCallback(
  provider: llmProvider,
  config: Config,
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken | undefined,
  resolve: (items: vscode.InlineCompletionItem[]) => void
): () => void {
  return function performCompletion() {
    if (handleCancellation(token, resolve, "before")) {
      return;
    }

    const prompt = buildPrompt(document, position);
    log(`Using provider: ${config.activeProvider}`);
    log("Prompt: " + prompt);

    const anonymizer = getAnonymizer(config);

    // Call the provider's query method
    provider
      .query(anonymizer ? anonymizer.anonymize(prompt) : prompt)
      .then(async (completionText) => {
        if (handleCancellation(token, resolve, "after")) {
          return;
        }

        if (!completionText) {
          resolve([]);
          return;
        }

        // Wrap completionText into InlineCompletionItems
        const item = new vscode.InlineCompletionItem(completionText);
        log("✅ Suggestio: Returning completion to VS Code");
        resolve([item]);
      })
      .catch((err) => {
        log("Error fetching completion: " + err);
        resolve([]);
      });
  };
}

export function provideInlineCompletionItems(
  provider: llmProvider,
  config: Config,
  document: vscode.TextDocument,
  position: vscode.Position,
  _context: vscode.InlineCompletionContext,
  token?: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[]> {
  return new Promise((resolve) => {
    debounce(
      createDebounceCallback(provider, config, document, position, token, resolve),
      DEBOUNCE_DELAY_MS
    );
  });
}
