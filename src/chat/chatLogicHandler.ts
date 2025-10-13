import { llmProvider } from "../providers/llmProvider.js";
import { Config } from "../config/types.js";

export class ChatLogicHandler {

  constructor(
    private config: Config,
    private provider: llmProvider,
    private log: (message: string) => void
  ) { }

  async fetchCompletion(userPrompt: string): Promise<string | null> {
    try {
      this.log(`Fetching completion from ${this.config.activeProvider}...`);
      const result = await this.provider.query(userPrompt);

      if (!result) {
        this.log("No completion returned.");
        return null;
      }

      this.log("Completion received.");
      return result;
    } catch (err: any) {
      this.log(`Error fetching completion: ${err.message}`);
      throw err;
    }
  }

  async fetchStreamCompletion(userPrompt: string, onToken: (token: string) => void): Promise<void> {
    try {
      this.log(`Fetching stream completion from ${this.config.activeProvider}...`);
      await this.provider.queryStream(userPrompt, onToken);
      this.log("Stream completion finished.");
    } catch (err: any) {
      this.log(`Error fetching stream completion: ${err.message}`);
      throw err;
    }
  }
}
