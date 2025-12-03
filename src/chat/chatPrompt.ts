import { ChatHistory, ChatMessage, IPrompt } from "./types.js";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content: "You are a code assistant",
};

export class ChatPrompt implements IPrompt {
  constructor(private conversation: ChatHistory, context?: string) {
    let finalConversation: ChatHistory = [...this.conversation];
    // Prepend the system prompt to the conversation history if it's not already there.
    // This ensures the system prompt is always at the beginning of the prompt sent to the LLM.
    if (finalConversation.length === 0 || finalConversation[0].role !== SYSTEM_PROMPT.role || finalConversation[0].content !== SYSTEM_PROMPT.content) {
      finalConversation.unshift(SYSTEM_PROMPT);
    }
    const hasOldContext = finalConversation.length > 1 && finalConversation[1].role === 'system';
    if (context) {
      const contextMessage: ChatMessage = { role: 'system', content: context };
      if (hasOldContext) {
        finalConversation[1] = contextMessage;
      } else {
        finalConversation.splice(1, 0, contextMessage);
      }
    } else {
      if (hasOldContext) {
        finalConversation.splice(1, 1);
      }
    }
    this.conversation = finalConversation;
  }

  generate(): ChatHistory {
    return this.conversation;
  }
}
