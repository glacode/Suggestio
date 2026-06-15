import { UserPrompt } from "./promptBuilder/userPrompt.js";
import { FimPrompt } from "./promptBuilder/fimPrompt.js";
// completion/completionProvider.ts
import {
  ITextDocument,
  IPosition,
  ICancellationToken,
  IInlineCompletionList,
  IIgnoreManager,
  ILlmProvider,
  IInlineCompletionConfig,
  IPrompt
} from "../types.js";
import { buildPromptForInlineCompletion } from "./promptBuilder/promptBuilder.js";
import { extractPrefix, extractSuffix } from "./promptBuilder/extractPrefixAndSuffix.js";
import { debounce } from "./debounceManager.js";
import { handleCancellation } from "./cancellation.js";
import { IEventBus } from "../utils/eventBus.js";
import { COMPLETION_LOGS } from "../constants/messages.js";
import { CONFIG_DEFAULTS } from "../constants/config.js";

const DEBOUNCE_DELAY_MS = 1000;

function createDebounceCallback(
  provider: ILlmProvider | undefined,
  config: IInlineCompletionConfig,
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

    const profileName = config.activeCompletionProfile || config.activeChatProfile;
    const profile = config.profiles[profileName];
    const modelName = profile?.model || "unknown";

    // FIM endpoints consume raw prefix/suffix; chat endpoints get the instruction-wrapped prompt.
    let prompt: IPrompt;
    let promptLogText: string;
    if (profile?.type === "deepseek-fim") {
      const prefix = extractPrefix(document, position);
      const suffix = extractSuffix(document, position, CONFIG_DEFAULTS.FIM_SUFFIX_MAX_LINES);
      prompt = new FimPrompt(prefix, suffix);
      promptLogText = `[FIM] prefix=${prefix.length} chars, suffix=${suffix.length} chars`;
    } else {
      promptLogText = buildPromptForInlineCompletion(document, position);
      prompt = new UserPrompt(promptLogText);
    }

    eventBus.emit('log', {
      level: 'info',
      message: COMPLETION_LOGS.USING_PROVIDER(`${profileName} (${modelName})`)
    });
    eventBus.emit('log', { level: 'debug', message: COMPLETION_LOGS.PROMPT(promptLogText) });

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
        eventBus.emit('log', { level: 'info', message: COMPLETION_LOGS.RETURNING_COMPLETION });
        resolve({ items: [item] });
      })
      .catch((err) => {
        eventBus.emit('log', { level: 'error', message: COMPLETION_LOGS.FETCHING_ERROR(err) });
        resolve({ items: [] });
      });
  };
}

export async function provideInlineCompletionItems(
  provider: ILlmProvider | undefined,
  config: IInlineCompletionConfig,
  ignoreManager: IIgnoreManager, // Changed to interface
  document: ITextDocument,
  position: IPosition,
  eventBus: IEventBus,
  _context: unknown, // Use unknown if we don't need it
  token?: ICancellationToken
): Promise<IInlineCompletionList> {
  if (config.inlineCompletion.enabled === false) {
    return { items: [] };
  }

  const isUntitled = document.uri.scheme === 'untitled';
  const isFile = document.uri.scheme === 'file';

  // Check scheme: 'file' is always allowed, 'untitled' needs explicit opt-in
  if (isUntitled && !config.inlineCompletion.enableInUntitledEditors) {
    return { items: [] };
  }
  if (!isFile && !isUntitled) {
    return { items: [] };
  }

  // Check if the language is supported (skip for untitled editors)
  if (!isUntitled && !config.inlineCompletion.supportedLanguages.includes(document.languageId)) {
    return { items: [] };
  }

  // Check if the document should be ignored
  if (document.uri.fsPath && await ignoreManager.shouldIgnore(document.uri.fsPath)) {
    eventBus.emit('log', { level: 'info', message: COMPLETION_LOGS.DOCUMENT_IGNORED(document.uri.fsPath) });
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
