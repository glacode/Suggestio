import { IStoredChatMessage, IChatMessage, IPrompt } from "../types.js";
import { SYSTEM_PROMPTS } from "../constants/prompts.js";

const SYSTEM_PROMPT: IChatMessage = {
  role: "system",
  content: SYSTEM_PROMPTS.AGENT,
};

/**
 * Represents a chat prompt builder responsible for constructing a well-formatted conversation history
 * for the Language Model. It ensures that the conversation always starts with a system prompt,
 * optionally augmented with additional context, and properly integrates user and assistant messages.
 *
 * The class adheres to the LLM spec that typically requires a conversation to begin with a system message,
 * followed by alternating user and assistant messages. It prevents duplicate system prompts by filtering
 * them out before prepending its own constructed system message.
 */
export class ChatPrompt implements IPrompt {
  public readonly context?: string;

  constructor(private conversation: IStoredChatMessage[], context?: string) {
    this.context = context;
    // The spec says 'Typically, a conversation is formatted with a system message first,
    // followed by alternating user and assistant messages.' So we merge the system prompt
    // with any provided context and ensure it's the first message in the conversation.
    const systemPromptContent = context
      ? `${SYSTEM_PROMPT.content}\n${context}`
      : SYSTEM_PROMPT.content;

    const systemPrompt: IChatMessage = {
      ...SYSTEM_PROMPT,
      content: systemPromptContent,
    };

    const conversationWithoutSystemPrompts = this.conversation.filter(
      (message) => message.role !== "system"
    );

    this.conversation = [systemPrompt, ...conversationWithoutSystemPrompts];
  }

  /**
   * Generates a sanitized version of the chat history, removing any 
   * local-only metadata (e.g., tool call success/failure status) 
   * to ensure no internal extension state is leaked to the LLM.
   * @returns An array of standard IChatMessage objects ready for LLM consumption.
   */
  generateChatHistory(): IChatMessage[] {
    return this.conversation.map(({ metadata, ...rest }) => rest);
  }
}
