import { IChatMessage, IFimPrompt } from "../../types.js";

/**
 * Prompt implementation for Fill-In-the-Middle (FIM) completions.
 *
 * Unlike the chat-based {@link UserPrompt}, this carries the code before and after
 * the cursor as separate `prefix`/`suffix` fields. FIM endpoints (e.g. DeepSeek
 * `/beta/completions`) consume these directly rather than a wrapped chat instruction.
 */
export class FimPrompt implements IFimPrompt {
  constructor(
    public readonly prefix: string,
    public readonly suffix: string
  ) {}

  /**
   * Chat-history fallback used only when a FIM prompt is, unexpectedly, sent
   * through a chat-completions provider. The raw prefix is the closest analogue.
   */
  generateChatHistory(): IChatMessage[] {
    return [{ role: "user", content: this.prefix }];
  }
}