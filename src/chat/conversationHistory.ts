import { Conversation } from "./conversation.js";
import { ChatMessage, IChatHistoryManager } from "./types.js";

export class ConversationHistory implements IChatHistoryManager {
  private history: Conversation = [];

  addMessage(message: ChatMessage) {
    this.history.push(message);
  }

  // Renamed from getHistory to getChatHistory to match IChatHistoryManager
  getChatHistory(): ChatMessage[] {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}
