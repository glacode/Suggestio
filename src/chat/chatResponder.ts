import { Config, ToolImplementation } from "../types.js";
import type { IChatResponder, IChatHistoryManager, IPrompt } from "../types.js";
import { Agent } from "../agent/agent.js";

export class ChatResponder implements IChatResponder {
    private agent: Agent;

    constructor(
        private config: Config,
        private log: (message: string) => void,
        private chatHistoryManager: IChatHistoryManager,
        private tools: ToolImplementation[] = []
    ) {
        this.agent = new Agent(config, log, this.chatHistoryManager, this.tools);
    }

    /**
     * Fetches a streaming chat response, handling potential tool calls recursively.
     */
    async fetchStreamChatResponse(prompt: IPrompt, onToken: (token: string) => void): Promise<void> {
        try {
            this.log(`Fetching stream completion from ${this.config.activeProvider}...`);

            await this.agent.run(prompt, onToken);

            this.log("Stream completion finished.");
        } catch (err: any) {
            this.handleError(err);
        }
    }

    /**
     * Logs and re-throws the error.
     */
    private handleError(err: any): void {
        this.log(`Error fetching stream completion: ${err.message}`);
        throw err;
    }
}
