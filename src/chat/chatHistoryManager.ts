import { IChatHistoryManager } from "./types.js";
import { ConversationHistory } from "./conversationHistory.js";
import { ChatMessage } from "./types.js";

export class ChatHistoryManager implements IChatHistoryManager {
  constructor(private conversationHistory: ConversationHistory) {}

  clearHistory(): void {
    this.conversationHistory.clearHistory();
  }

  addMessage(message: ChatMessage): void {
    this.conversationHistory.addMessage(message);
  }

  getChatHistory(): ChatMessage[] {
    return this.conversationHistory.getHistory();
  }
}
