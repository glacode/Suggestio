import { IChatMessage, ChatHistory, IChatHistoryManager } from "../types.js";

export class ChatHistoryManager implements IChatHistoryManager {
  private history: ChatHistory = [];

  addMessage(message: IChatMessage) {
    this.history.push(message);
  }

  // Renamed from getHistory to getChatHistory to match IChatHistoryManager
  getChatHistory(): ChatHistory {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}
