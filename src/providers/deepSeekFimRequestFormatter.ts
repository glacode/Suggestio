import {
  IAnonymizer,
  IPrompt,
  IToolDefinition,
  IOpenAIRequestFormatter,
  isFimPrompt,
} from "../types.js";
import { DeepSeekFimRequestBody } from "./openAIRequestFormatter.js";

/**
 * Request formatter for DeepSeek's Fill-In-the-Middle (FIM) completion endpoint
 * (`/beta/completions`).
 *
 * Produces a `{ prompt, suffix }` body instead of a `{ messages }` chat body,
 * matching the legacy completions dialect DeepSeek exposes for FIM.
 *
 * `tools` are not applicable to FIM completions and are ignored.
 */
export class DeepSeekFimRequestFormatter implements IOpenAIRequestFormatter {
  constructor(private readonly anonymizer?: IAnonymizer) {}

  formatRequest(
    prompt: IPrompt,
    model: string,
    options: {
      maxTokens: number;
      stream: boolean;
      tools?: IToolDefinition[];
    }
  ): DeepSeekFimRequestBody {
    // Resolve the prefix/suffix. A FIM-aware prompt carries them directly;
    // otherwise fall back to the chat history's first message as the prefix.
    let prefix: string;
    let suffix = "";

    if (isFimPrompt(prompt)) {
      prefix = prompt.prefix;
      suffix = prompt.suffix;
    } else {
      prefix = prompt.generateChatHistory()[0]?.content ?? "";
    }

    if (this.anonymizer) {
      prefix = this.anonymizer.anonymize(prefix);
      suffix = this.anonymizer.anonymize(suffix);
    }

    const body: DeepSeekFimRequestBody = {
      model,
      prompt: prefix,
      max_tokens: options.maxTokens,
    };

    // Only include `suffix` when there is code after the cursor; some endpoints
    // reject an empty-string suffix.
    if (suffix) {
      body.suffix = suffix;
    }

    if (options.stream) {
      body.stream = true;
    }

    return body;
  }
}
