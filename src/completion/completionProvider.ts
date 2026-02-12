import { UserPrompt } from "./promptBuilder/userPrompt.js";
// completion/completionProvider.ts
import { 
  ITextDocument, 
  IPosition, 
  ICancellationToken, 
  IInlineCompletionList, 
  IIgnoreManager,
  Config,
  ILlmProvider
} from "../types.js";
import { buildPromptForInlineCompletion } from "./promptBuilder/promptBuilder.js";
import { debounce } from "./debounceManager.js";
import { handleCancellation } from "./cancellation.js";
import { ILogger } from "../logger.js";

const DEBOUNCE_DELAY_MS = 1000;

function createDebounceCallback(
  provider: ILlmProvider | undefined,
  config: Config,
  document: ITextDocument,
  position: IPosition,
  token: ICancellationToken | undefined,
  resolve: (items: IInlineCompletionList) => void,
  logger: ILogger
): () => void {
  return async function performCompletion() {
    if (!provider) {
      resolve({ items: [] });
      return;
    }
    if (handleCancellation(token, resolve, "before", logger)) {
      return;
    }

    const promptText = buildPromptForInlineCompletion(document, position);
    logger.info(`Using provider: ${config.activeProvider}`);
    logger.debug("Prompt: " + promptText);

    const prompt = new UserPrompt(promptText);

    // Call the provider's query method
    provider
      .query(prompt)
      .then(async (response) => {
        if (handleCancellation(token, resolve, "after", logger)) {
          return;
        }

        if (!response || !response.content) {
          resolve({ items: [] });
          return;
        }

        // Wrap completionText into InlineCompletionItems
        const item = { 
          insertText: response.content, 
          range: { start: position, end: position } 
        };
        logger.info("✅ Suggestio: Returning completion to VS Code");
        resolve({ items: [item] });
      })
      .catch((err) => {
        logger.error("Error fetching completion: " + err);
        resolve({ items: [] });
      });
  };
}

export async function provideInlineCompletionItems(
  provider: ILlmProvider | undefined,
  config: Config,
  ignoreManager: IIgnoreManager, // Changed to interface
  document: ITextDocument,
  position: IPosition,
  logger: ILogger,
  _context: unknown, // Use unknown if we don't need it
  token?: ICancellationToken
): Promise<IInlineCompletionList> {
  if (config.enableInlineCompletion === false) {
    return { items: [] };
  }

  // Check if the document should be ignored
  if (document.uri.fsPath && await ignoreManager.shouldIgnore(document.uri.fsPath)) {
    logger.info(`Document ${document.uri.fsPath} is ignored. Skipping inline completion.`);
    return { items: [] };
  }

  const result = await new Promise<IInlineCompletionList>((resolve) => {
    if (!provider) {
      resolve({ items: [] });
      return;
    }
    debounce(
      createDebounceCallback(provider, config, document, position, token, resolve, logger),
      DEBOUNCE_DELAY_MS
    );
  });
  return result;
}
