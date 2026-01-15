import { Config, ToolImplementation } from "../types.js";
import type { IChatResponder, IChatHistoryManager, IPrompt, ChatMessage } from "../types.js";

export class ChatResponder implements IChatResponder {
  constructor(
    private config: Config,
    private log: (message: string) => void,
    private chatHistoryManager: IChatHistoryManager,
    private tools: ToolImplementation[] = []
  ) { }

  async fetchStreamChatResponse(prompt: IPrompt, onToken: (token: string) => void): Promise<void> {
    try {
      this.log(`Fetching stream completion from ${this.config.activeProvider}...`);
      
      const toolDefinitions = this.tools.map(t => t.definition);
      
      let currentPrompt = prompt;
      let iterations = 0;
      const MAX_ITERATIONS = 5;

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        
        const response: ChatMessage | null = await this.config.llmProviderForChat!.queryStream(
            currentPrompt, 
            onToken, 
            toolDefinitions.length > 0 ? toolDefinitions : undefined
        );

        if (!response) {
            break;
        }

        this.chatHistoryManager.addMessage(response);

        if (response.tool_calls && response.tool_calls.length > 0) {
            this.log(`Assistant requested ${response.tool_calls.length} tool calls.`);
            
            for (const toolCall of response.tool_calls) {
                const tool = this.tools.find(t => t.definition.name === toolCall.function.name);
                if (tool) {
                    this.log(`Executing tool: ${toolCall.function.name}`);
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const result = await tool.execute(args);
                        this.chatHistoryManager.addMessage({
                            role: 'tool',
                            content: result,
                            tool_call_id: toolCall.id
                        });
                    } catch (e: any) {
                        this.log(`Error executing tool: ${e.message}`);
                        this.chatHistoryManager.addMessage({
                            role: 'tool',
                            content: `Error: ${e.message}`,
                            tool_call_id: toolCall.id
                        });
                    }
                } else {
                    this.log(`Tool not found: ${toolCall.function.name}`);
                    this.chatHistoryManager.addMessage({
                        role: 'tool',
                        content: `Error: Tool ${toolCall.function.name} not found.`,
                        tool_call_id: toolCall.id
                    });
                }
            }
            
            // After tool results are added, we need to query the LLM again to get the final answer.
            // We create a new prompt with the updated history.
            // Note: ChatPrompt constructor handles system prompt and context, so we just pass the history.
            currentPrompt = {
                generateChatHistory: () => this.chatHistoryManager.getChatHistory()
            };
            this.log("Re-querying LLM with tool results...");
            continue;
        }

        // No tool calls, we are done.
        break;
      }

      this.log("Stream completion finished.");
    } catch (err: any) {
      this.log(`Error fetching stream completion: ${err.message}`);
      throw err;
    }
  }
}
