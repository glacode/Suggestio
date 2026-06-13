import { 
  IChatMessage, 
  IAnonymizer, 
  IPrompt, 
  IToolDefinition, 
  IReasoningProcessor, 
  IOpenAIRequestFormatter 
} from "../types.js";

/**
 * Represents the body of a completion request sent to an OpenAI-compatible API.
 */
export type OpenAIRequestBody = {
  model: string;
  messages: IChatMessage[];
  max_tokens: number;
  stream?: boolean;
  tools?: {
    type: "function";
    function: IToolDefinition;
  }[];
};

/**
 * Implementation of IOpenAIRequestFormatter that handles anonymization and reasoning formatting.
 */
export class OpenAIRequestFormatter implements IOpenAIRequestFormatter {
  constructor(
    private readonly reasoningProcessor: IReasoningProcessor,
    private readonly anonymizer?: IAnonymizer
  ) {}

  /**
   * Prepares chat messages for the API request, applying anonymization to user messages if configured.
   */
  private prepareMessages(conversation: IChatMessage[]): IChatMessage[] {
    return conversation.map((message) => {
      let content = message.content;
      if (this.anonymizer && message.role === "user") {
        content = this.anonymizer.anonymize(message.content);
      }

      // Use reasoning processor to format the message for history
      // (e.g., merging reasoning into content for models that expect tags).
      return this.reasoningProcessor.prepareHistoryMessage({
        ...message,
        content
      });
    });
  }

  /**
   * Constructs the JSON request body for the completion API.
   */
  formatRequest(
    prompt: IPrompt,
    model: string,
    options: {
      maxTokens: number;
      stream: boolean;
      tools?: IToolDefinition[];
    }
  ): OpenAIRequestBody {
    const conversation = prompt.generateChatHistory();
    const messages = this.prepareMessages(conversation);

    const body: OpenAIRequestBody = {
      model: model,
      messages: messages,
      max_tokens: options.maxTokens,
    };

    if (options.stream) {
      body.stream = true;
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({ type: "function", function: t }));
    }

    return body;
  }
}
