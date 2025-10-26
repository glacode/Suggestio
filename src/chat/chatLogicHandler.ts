import { llmProvider } from "../providers/llmProvider.js";
import { Config } from "../config/types.js";
import { ConversationHistory } from "./conversationHistory.js";
import { ChatPrompt } from "./chatPrompt.js";

export class ChatLogicHandler {
  private conversationHistory = new ConversationHistory();

  constructor(
    private config: Config,
    private provider: llmProvider,
    private log: (message: string) => void
  ) { }

  async fetchCompletion(userPrompt: string): Promise<string | null> {
    try {
      this.log(`Fetching completion from ${this.config.activeProvider}...`);
      this.conversationHistory.addMessage({ role: "user", content: userPrompt });
      const prompt = new ChatPrompt(this.conversationHistory.getHistory());
      const result = await this.provider.query(prompt);

      if (!result) {
        this.log("No completion returned.");
        return null;
      }

      this.conversationHistory.addMessage({ role: "model", content: result });
      this.log("Completion received.");
      return result;
    } catch (err: any) {
      this.log(`Error fetching completion: ${err.message}`);
      throw err;
    }
  }

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
      await this.provider.queryStream(prompt, recordingOnToken);
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
