import { ChatHistory, ChatMessage } from "./types.js";
import { IPrompt } from "../promptBuilder/prompt.js";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content: "You are a code assistant",
};

export class ChatPrompt implements IPrompt {
  constructor(private conversation: ChatHistory) {
    // Prepend the system prompt to the conversation history if it's not already there.
    // This ensures the system prompt is always at the beginning of the prompt sent to the LLM.
    if (conversation.length === 0 || conversation[0].role !== SYSTEM_PROMPT.role || conversation[0].content !== SYSTEM_PROMPT.content) {
      this.conversation = [SYSTEM_PROMPT, ...conversation];
    }
  }

  generate(): ChatHistory {
    return this.conversation;
  }
}
