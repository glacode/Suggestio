import { UserPrompt } from "./promptBuilder/userPrompt.js";
// completion/completionProvider.ts
import { 
  ITextDocument, 
  IPosition, 
  ICancellationToken, 
  IInlineCompletionList, 
  IIgnoreManager,
  Config,
  llmProvider
} from "../types.js";
import { buildPromptForInlineCompletion } from "./promptBuilder/promptBuilder.js";
import { debounce } from "./debounceManager.js";
import { handleCancellation } from "./cancellation.js";
import { log } from "../logger.js";

const DEBOUNCE_DELAY_MS = 1000;

function createDebounceCallback(
  provider: llmProvider | undefined,
  config: Config,
  document: ITextDocument,
  position: IPosition,
  token: ICancellationToken | undefined,
  resolve: (items: IInlineCompletionList) => void
): () => void {
  return async function performCompletion() {
    if (!provider) {
      resolve({ items: [] });
      return;
    }
    if (handleCancellation(token, resolve, "before")) {
      return;
    }

    const promptText = buildPromptForInlineCompletion(document, position);
    log(`Using provider: ${config.activeProvider}`);
    log("Prompt: " + promptText);

    const prompt = new UserPrompt(promptText);

    // Call the provider's query method
    provider
      .query(prompt)
      .then(async (completionText) => {
        if (handleCancellation(token, resolve, "after")) {
          return;
        }

        if (!completionText) {
          resolve({ items: [] });
          return;
        }

        // Wrap completionText into InlineCompletionItems
        const item = { 
          insertText: completionText, 
          range: { start: position, end: position } 
        };
        log("✅ Suggestio: Returning completion to VS Code");
        resolve({ items: [item] });
      })
      .catch((err) => {
        log("Error fetching completion: " + err);
        resolve({ items: [] });
      });
  };
}

export async function provideInlineCompletionItems(
  provider: llmProvider | undefined,
  config: Config,
  ignoreManager: IIgnoreManager, // Changed to interface
  document: ITextDocument,
  position: IPosition,
  _context: unknown, // Use unknown if we don't need it
  token?: ICancellationToken
): Promise<IInlineCompletionList> {
  if (config.enableInlineCompletion === false) {
    return { items: [] };
  }

  // Check if the document should be ignored
  if (document.uri.fsPath && await ignoreManager.shouldIgnore(document.uri.fsPath)) {
    log(`Document ${document.uri.fsPath} is ignored. Skipping inline completion.`);
    return { items: [] };
  }

  const result = await new Promise<IInlineCompletionList>((resolve) => {
    if (!provider) {
      resolve({ items: [] });
      return;
    }
    debounce(
      createDebounceCallback(provider, config, document, position, token, resolve),
      DEBOUNCE_DELAY_MS
    );
  });
  return result;
}
