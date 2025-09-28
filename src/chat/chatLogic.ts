import { llmProvider } from "../providers/llmProvider.js";
import { getActiveProvider } from "../providers/providerFactory.js";
import { Config } from "../config/types.js";
import { log } from "../logger.js";

export class ChatLogicHandler {
  private provider: llmProvider;

  constructor(private config: Config) {
    // Build the provider instance once
    this.provider = getActiveProvider(config)!;
  }

  async fetchCompletion(userPrompt: string): Promise<string | null> {
    try {
      log(`Fetching completion from ${this.config.activeProvider}...`);
      const result = await this.provider.query(userPrompt);

      if (!result) {
        log("No completion returned.");
        return null;
      }

      log("Completion received.");
      return result;
    } catch (err: any) {
      log(`Error fetching completion: ${err.message}`);
      throw err;
    }
  }
}
