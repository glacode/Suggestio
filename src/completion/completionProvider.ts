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
import { IEventBus } from "../utils/eventBus.js";

const DEBOUNCE_DELAY_MS = 1000;

function createDebounceCallback(
  provider: ILlmProvider | undefined,
  config: Config,
  document: ITextDocument,
  position: IPosition,
  token: ICancellationToken | undefined,
  resolve: (items: IInlineCompletionList) => void,
  eventBus: IEventBus
): () => void {
  return async function performCompletion() {
    if (!provider) {
      resolve({ items: [] });
      return;
    }
    if (handleCancellation(token, resolve, "before", eventBus)) {
      return;
    }

    const promptText = buildPromptForInlineCompletion(document, position);
    eventBus.emit('log', { level: 'info', message: `Using provider: ${config.activeProvider}` });
    eventBus.emit('log', { level: 'debug', message: "Prompt: " + promptText });

    const prompt = new UserPrompt(promptText);

    // Call the provider's query method
    provider
      .query(prompt)
      .then(async (response) => {
        if (handleCancellation(token, resolve, "after", eventBus)) {
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
        eventBus.emit('log', { level: 'info', message: "✅ Suggestio: Returning completion to VS Code" });
        resolve({ items: [item] });
      })
      .catch((err) => {
        eventBus.emit('log', { level: 'error', message: "Error fetching completion: " + err });
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
  eventBus: IEventBus,
  _context: unknown, // Use unknown if we don't need it
  token?: ICancellationToken
): Promise<IInlineCompletionList> {
  if (config.enableInlineCompletion === false) {
    return { items: [] };
  }

  // Check if the document should be ignored
  if (document.uri.fsPath && await ignoreManager.shouldIgnore(document.uri.fsPath)) {
    eventBus.emit('log', { level: 'info', message: `Document ${document.uri.fsPath} is ignored. Skipping inline completion.` });
    return { items: [] };
  }

  const result = await new Promise<IInlineCompletionList>((resolve) => {
    if (!provider) {
      resolve({ items: [] });
      return;
    }
    debounce(
      createDebounceCallback(provider, config, document, position, token, resolve, eventBus),
      DEBOUNCE_DELAY_MS
    );
  });
  return result;
}
