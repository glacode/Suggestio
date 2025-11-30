import { Config } from "../config/types.js";
import type { IChatResponder, IChatHistoryManager } from "./types.js";
import { ConversationHistory } from "./conversationHistory.js";
import { ChatPrompt } from "./chatPrompt.js";

export class ChatLogicHandler implements IChatResponder, IChatHistoryManager {
  private conversationHistory = new ConversationHistory();

  constructor(
    private config: Config,
    private log: (message: string) => void
  ) { }

  async fetchStreamChatResponse(userPrompt: string, onToken: (token: string) => void): Promise<void> {
    try {
      this.log(`Fetching stream completion from ${this.config.activeProvider}...`);
      this.conversationHistory.addMessage({ role: "user", content: userPrompt });
      const prompt = new ChatPrompt(this.conversationHistory.getHistory());
      let fullResponse = "";
      const recordingOnToken = (token: string) => {
        fullResponse += token;
        onToken(token);
      };
      await this.config.llmProviderForChat!.queryStream(prompt, recordingOnToken);
      this.conversationHistory.addMessage({ role: "model", content: fullResponse });
      this.log("Stream completion finished.");
    } catch (err: any) {
      this.log(`Error fetching stream completion: ${err.message}`);
      throw err;
    }
  }

  clearHistory() {
    this.conversationHistory.clearHistory();
  }
}
