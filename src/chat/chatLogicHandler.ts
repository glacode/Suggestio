import { Config } from "../config/types.js";
import type { IChatResponder, IChatHistoryManager } from "./types.js";
import { ChatPrompt } from "./chatPrompt.js";

export class ChatLogicHandler implements IChatResponder {
  constructor(
    private config: Config,
    private log: (message: string) => void,
    private chatHistoryManager: IChatHistoryManager // Injected fully capable history manager
  ) { }

  async fetchStreamChatResponse(userPrompt: string, onToken: (token: string) => void): Promise<void> {
    try {
      this.log(`Fetching stream completion from ${this.config.activeProvider}...`);
      this.chatHistoryManager.addMessage({ role: "user", content: userPrompt }); // Use injected manager
      const prompt = new ChatPrompt(this.chatHistoryManager.getChatHistory()); // Use injected manager
      let fullResponse = "";
      const recordingOnToken = (token: string) => {
        fullResponse += token;
        onToken(token);
      };
      await this.config.llmProviderForChat!.queryStream(prompt, recordingOnToken);
      this.chatHistoryManager.addMessage({ role: "model", content: fullResponse }); // Use injected manager
      this.log("Stream completion finished.");
    } catch (err: any) {
      this.log(`Error fetching stream completion: ${err.message}`);
      throw err;
    }
  }
}
