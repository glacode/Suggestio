import { ChatMessage, Conversation, IChatHistoryManager } from "./types.js";

export class ChatHistoryManager implements IChatHistoryManager {
  private history: Conversation = [];

  addMessage(message: ChatMessage) {
    this.history.push(message);
  }

  // Renamed from getHistory to getChatHistory to match IChatHistoryManager
  getChatHistory(): Conversation {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}
