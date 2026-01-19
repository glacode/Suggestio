import fetch, { Response } from "node-fetch";
import { log } from "../logger.js";
import { ChatMessage, IAnonymizer, IPrompt, ILlmProvider, ToolDefinition, ToolCall } from "../types.js";

type OpenAIResponse = {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: ToolCall[];
    };
  }[];
};

export class OpenAICompatibleProvider implements ILlmProvider {
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private anonymizer?: IAnonymizer;

  /**
   * Creates an instance of OpenAICompatibleProvider.
   * 
   * @param endpoint - The API endpoint URL for the OpenAI-compatible service.
   * @param apiKey - The API key for authentication.
   * @param model - The model identifier to be used for completions.
   * @param anonymizer - Optional anonymizer to protect sensitive data in user messages.
   */
  constructor(
    endpoint: string,
    apiKey: string,
    model: string,
    anonymizer?: IAnonymizer
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.anonymizer = anonymizer;
  }

  /**
   * Prepares chat messages for the API request, applying anonymization to user messages if configured.
   * 
   * @param conversation - The list of chat messages in the conversation history.
   * @returns An array of message objects formatted for the OpenAI-compatible API.
   */
  private prepareMessages(
    conversation: ChatMessage[]
  ): any[] {
    return conversation.map((message) => {
      const role = message.role;

      let content = message.content;
      if (this.anonymizer && message.role === "user") {
        content = this.anonymizer.anonymize(message.content);
      }

      const msg: any = { role, content };
      if (message.tool_calls) {
        msg.tool_calls = message.tool_calls;
      }
      if (message.tool_call_id) {
        msg.tool_call_id = message.tool_call_id;
      }
      return msg;
    });
  }

  /**
   * Constructs the request body for the completion API.
   * 
   * @param prompt - The prompt object that generates the chat history.
   * @param tools - Optional tool definitions for function calling.
   * @param stream - Whether the response should be streamed.
   * @returns A JSON-serializable object representing the request body.
   */
  private createRequestBody(
    prompt: IPrompt,
    tools: ToolDefinition[] | undefined,
    stream: boolean
  ): any {
    const conversation = prompt.generateChatHistory();
    const messages = this.prepareMessages(conversation);

    const body: any = {
      model: this.model,
      messages: messages,
      max_tokens: 10000,
    };

    if (stream) {
      body.stream = true;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({ type: "function", function: t }));
    }

    return body;
  }

  /**
   * Sends a POST request to the provider's endpoint.
   * 
   * @param body - The request body to be sent as JSON.
   * @returns A promise that resolves to the fetch Response object.
   */
  private async post(body: any): Promise<Response> {
    return await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Performs a non-streaming completion request.
   * 
   * @param prompt - The prompt to be sent.
   * @param tools - Optional tools available for the model to use.
   * @returns A promise resolving to the assistant's message, or null if no choice was returned.
   */
  async query(
    prompt: IPrompt,
    tools?: ToolDefinition[]
  ): Promise<ChatMessage | null> {
    const body = this.createRequestBody(prompt, tools, false);
    const response = await this.post(body);

    const json = (await response.json()) as OpenAIResponse;
    log("Response:" + JSON.stringify(json, null, 2));

    const choice = json.choices?.[0]?.message;
    if (!choice) {
      return null;
    }

    let content = choice.content || "";
    if (content && this.anonymizer) {
      content = this.anonymizer.deanonymize(content);
    }

    return {
      role: "assistant",
      content,
      tool_calls: choice.tool_calls,
    };
  }

  /**
   * Performs a streaming completion request.
   * 
   * @param prompt - The prompt to be sent.
   * @param onToken - Callback function invoked for each new content token received.
   * @param tools - Optional tools available for the model to use.
   * @returns A promise resolving to the final consolidated assistant's message.
   */
  async queryStream(
    prompt: IPrompt,
    onToken: (token: string) => void,
    tools?: ToolDefinition[]
  ): Promise<ChatMessage | null> {
    const body = this.createRequestBody(prompt, tools, true);
    log(`OpenAI Request Body: ${JSON.stringify(body, null, 2)}`);

    const response = await this.post(body);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
    }

    return this.parseStream(response, onToken);
  }

  /**
   * Parses the Server-Sent Events (SSE) stream from the provider's response.
   * 
   * @param response - The fetch Response object containing the body stream.
   * @param onToken - Callback function for each content token.
   * @returns A promise resolving to the complete assistant's message after the stream ends.
   * @throws Error if the response body is missing.
   */
  private async parseStream(
    response: Response,
    onToken: (token: string) => void
  ): Promise<ChatMessage> {
    if (!response.body) {
      throw new Error("Response body is null");
    }

    const streamingDeanonymizer = this.anonymizer?.createStreamingDeanonymizer();
    let fullContent = "";
    const toolCalls: ToolCall[] = [];

    let buffer = "";
    for await (const chunk of response.body) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }

        const data = line.substring(6).trim();
        if (data === "[DONE]") {
          fullContent += this.flushDeanonymizer(streamingDeanonymizer, onToken);
          return this.createAssistantMessage(fullContent, toolCalls);
        }

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (!delta) {
            continue;
          }

          fullContent += this.handleContentDelta(
            delta,
            onToken,
            streamingDeanonymizer
          );
          this.handleToolCallsDelta(delta, toolCalls);
        } catch (e) {
          log("Error parsing chunk: " + data);
        }
      }
    }

    return this.createAssistantMessage(fullContent, toolCalls);
  }

  /**
   * Processes a content delta from the stream, applying deanonymization if necessary.
   * 
   * @param delta - The delta object from the API response chunk.
   * @param onToken - Callback to invoke with the (potentially deanonymized) token.
   * @param streamingDeanonymizer - The active streaming deanonymizer instance, if any.
   * @returns The processed content token.
   */
  private handleContentDelta(
    delta: any,
    onToken: (token: string) => void,
    streamingDeanonymizer: any
  ): string {
    if (delta.content) {
      const token = delta.content;
      if (streamingDeanonymizer) {
        const { processed } = streamingDeanonymizer.process(token);
        if (processed) {
          onToken(processed);
          return processed;
        }
      } else {
        onToken(token);
        return token;
      }
    }
    return "";
  }

  /**
   * Accumulates tool call deltas into the provided toolCalls array.
   * 
   * @param delta - The delta object from the API response chunk.
   * @param toolCalls - The array accumulating tool calls for the current response.
   */
  private handleToolCallsDelta(delta: any, toolCalls: ToolCall[]): void {
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.index === undefined) {
          continue;
        }
        if (!toolCalls[tc.index]) {
          toolCalls[tc.index] = {
            id: tc.id || "",
            type: "function",
            function: { name: "", arguments: "" },
          };
        }
        if (tc.id) {
          toolCalls[tc.index].id = tc.id;
        }
        if (tc.function?.name) {
          toolCalls[tc.index].function.name += tc.function.name;
        }
        if (tc.function?.arguments) {
          toolCalls[tc.index].function.arguments += tc.function.arguments;
        }
      }
    }
  }

  /**
   * Flushes any remaining content from the streaming deanonymizer.
   * 
   * @param streamingDeanonymizer - The active streaming deanonymizer instance.
   * @param onToken - Callback to invoke with the flushed content.
   * @returns The flushed content string.
   */
  private flushDeanonymizer(
    streamingDeanonymizer: any,
    onToken: (token: string) => void
  ): string {
    if (streamingDeanonymizer) {
      const remaining = streamingDeanonymizer.flush();
      if (remaining) {
        onToken(remaining);
        return remaining;
      }
    }
    return "";
  }

  /**
   * Creates the final ChatMessage object for the assistant's response.
   * 
   * @param content - The consolidated content of the message.
   * @param toolCalls - The array of tool calls generated by the model.
   * @returns A ChatMessage object.
   */
  private createAssistantMessage(
    content: string,
    toolCalls: ToolCall[]
  ): ChatMessage {
    return {
      role: "assistant",
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
