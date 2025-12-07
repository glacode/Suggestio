import { ChatHistory, ChatMessage, IPrompt } from "./types.js";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content: "You are a code assistant",
};

export class ChatPrompt implements IPrompt {
  constructor(private conversation: ChatHistory, context?: string) {
    let finalConversation: ChatHistory = [...this.conversation];

    // Ensure the system prompt is always at the beginning of the conversation.
    // If the conversation is empty or the first message is not the SYSTEM_PROMPT,
    // prepend it to maintain consistent LLM instruction.
    if (finalConversation.length === 0 || finalConversation[0].role !== SYSTEM_PROMPT.role || finalConversation[0].content !== SYSTEM_PROMPT.content) {
      finalConversation.unshift(SYSTEM_PROMPT);
    }

    // Check if there's an existing context message (which would be the second system message).
    const hasExistingContext = finalConversation.length > 1 && finalConversation[1].role === 'system';

    if (context) {
      // If new context is provided, create a system message for it.
      const contextMessage: ChatMessage = { role: 'system', content: context };
      if (hasExistingContext) {
        // If an old context exists, update it with the new context.
        finalConversation[1] = contextMessage;
      } else {
        // Otherwise, insert the new context as the second message.
        finalConversation.splice(1, 0, contextMessage);
      }
    } else {
      // If no new context is provided but an old one exists, remove the old context.
      if (hasExistingContext) {
        finalConversation.splice(1, 1);
      }
    }

    this.conversation = finalConversation;
  }

  /**
   * Generates the final chat history, including system and context messages,
   * ready to be sent to the Language Model.
   * @returns The prepared chat history.
   */
  generate(): ChatHistory {
    return this.conversation;
  }
}
