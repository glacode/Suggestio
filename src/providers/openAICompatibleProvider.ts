import fetch from "node-fetch";
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

  async query(prompt: IPrompt, tools?: ToolDefinition[]): Promise<ChatMessage | null> {
    const conversation = prompt.generateChatHistory();
    const messages = this.prepareMessages(conversation);

    const body: any = {
      model: this.model,
      messages: messages,
      max_tokens: 10000,
    };
    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({ type: 'function', function: t }));
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

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
      tool_calls: choice.tool_calls
    };
  }

  async queryStream(
    prompt: IPrompt,
    onToken: (token: string) => void,
    tools?: ToolDefinition[]
  ): Promise<ChatMessage | null> {
    const conversation = prompt.generateChatHistory();
    const messages = this.prepareMessages(conversation);

    const requestBody: any = {
      model: this.model,
      messages: messages,
      max_tokens: 10000,
      stream: true,
    };
    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(t => ({ type: 'function', function: t }));
    }

    log(`OpenAI Request Body: ${JSON.stringify(requestBody, null, 2)}`);

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    let streamingDeanonymizer;
    if (this.anonymizer) {
      streamingDeanonymizer = this.anonymizer.createStreamingDeanonymizer();
    }

    let fullContent = "";
    let toolCalls: ToolCall[] = [];

    let buffer = "";
    for await (const chunk of response.body) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.substring(6).trim();
          if (data === "[DONE]") {
            if (streamingDeanonymizer) {
              const remaining = streamingDeanonymizer.flush();
              if (remaining) {
                fullContent += remaining;
                onToken(remaining);
              }
            }
            return { role: "assistant", content: fullContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined };
          }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            if (!delta) { continue; }

            if (delta.content) {
              const token = delta.content;
              if (streamingDeanonymizer) {
                const { processed } = streamingDeanonymizer.process(token);
                if (processed) {
                  fullContent += processed;
                  onToken(processed);
                }
              } else {
                fullContent += token;
                onToken(token);
              }
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index === undefined) { continue; }
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = {
                    id: tc.id || "",
                    type: "function",
                    function: { name: "", arguments: "" }
                  };
                }
                if (tc.id) { toolCalls[tc.index].id = tc.id; }
                if (tc.function?.name) { toolCalls[tc.index].function.name += tc.function.name; }
                if (tc.function?.arguments) { toolCalls[tc.index].function.arguments += tc.function.arguments; }
              }
            }
          } catch (e) {
            log("Error parsing chunk: " + data);
          }
        }
      }
    }

    return { role: "assistant", content: fullContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined };
  }
}
