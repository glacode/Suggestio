import { Conversation, ChatMessage } from "./conversation.js";

export class ConversationHistory {
  private history: Conversation = [];

  addMessage(message: ChatMessage) {
    this.history.push(message);
  }

  getHistory(): Conversation {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}
