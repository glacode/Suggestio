import { IStoredChatMessage, IChatHistoryManager } from "../types.js";

export class ChatHistoryManager implements IChatHistoryManager {
  private history: IStoredChatMessage[] = [];

  addMessage(message: IStoredChatMessage) {
    this.history.push(message);
  }

  // Renamed from getHistory to getChatHistory to match IChatHistoryManager
  getChatHistory(): IStoredChatMessage[] {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}
