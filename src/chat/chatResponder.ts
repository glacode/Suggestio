import { Config } from "../types.js";
import type { IChatResponder, IChatHistoryManager, IPrompt } from "../types.js";

export class ChatResponder implements IChatResponder {
  constructor(
    private config: Config,
    private log: (message: string) => void,
    private chatHistoryManager: IChatHistoryManager // Injected fully capable history manager
  ) { }

  async fetchStreamChatResponse(prompt: IPrompt, onToken: (token: string) => void): Promise<void> {
    try {
      this.log(`Fetching stream completion from ${this.config.activeProvider}...`);
      let fullResponse = "";
      const recordingOnToken = (token: string) => {
        fullResponse += token;
        onToken(token);
      };
      await this.config.llmProviderForChat!.queryStream(prompt, recordingOnToken);
      this.chatHistoryManager.addMessage({ role: 'assistant', content: fullResponse }); // Use injected manager
      this.log("Stream completion finished.");
    } catch (err: any) {
      this.log(`Error fetching stream completion: ${err.message}`);
      throw err;
    }
  }
}
