import { ChatHistory, ChatMessage, IPrompt } from "./types.js";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content: "You are a code assistant",
};

export class ChatPrompt implements IPrompt {
  constructor(private conversation: ChatHistory, context?: string) {
    const systemPromptContent = context
      ? `${SYSTEM_PROMPT.content}\n${context}`
      : SYSTEM_PROMPT.content;

    const systemPrompt: ChatMessage = {
      ...SYSTEM_PROMPT,
      content: systemPromptContent,
    };

    const conversationWithoutSystemPrompts = this.conversation.filter(
      (message) => message.role !== "system"
    );

    this.conversation = [systemPrompt, ...conversationWithoutSystemPrompts];
  }

  /**
   * Generates the final chat history, including system and context messages,
   * ready to be sent to the Language Model.
   * @returns The prepared chat history.
   */
  generateChatHistory(): ChatHistory {
    return this.conversation;
  }
}
