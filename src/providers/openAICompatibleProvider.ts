import fetch from "node-fetch";
import { llmProvider } from "./llmProvider.js";
import { Anonymizer } from "../anonymizer/anonymizer.js";
import { log } from "../logger.js";
import { Prompt } from "../promptBuilder/prompt.js";
import { ChatMessage } from "../chat/types.js";

type OpenAIResponse = {
  choices?: { message?: { content?: string } }[];
};

export class OpenAICompatibleProvider implements llmProvider {
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private anonymizer?: Anonymizer;

  constructor(
    endpoint: string,
    apiKey: string,
    model: string,
    anonymizer?: Anonymizer
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.anonymizer = anonymizer;
  }

  private prepareMessages(
    conversation: ChatMessage[]
  ): { role: string; content: string }[] {
    return conversation.map((message) => {
      const role = message.role;

      const content =
        this.anonymizer && message.role === "user"
          ? this.anonymizer.anonymize(message.content)
          : message.content;

      return { role, content };
    });
  }

  async query(prompt: Prompt): Promise<string | null> {
    const conversation = prompt.generate();
    const messages = this.prepareMessages(conversation);

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: "You are a helpful coding assistant." },
          ...messages,
        ],
        max_tokens: 10000,
      }),
    });

    const json = (await response.json()) as OpenAIResponse;
    log("Response:" + JSON.stringify(json, null, 2));

    let content = json.choices?.[0]?.message?.content || null;
    if (content && this.anonymizer) {
      content = this.anonymizer.deanonymize(content);
    }

    return content;
  }

  async queryStream(
    prompt: Prompt,
    onToken: (token: string) => void
  ): Promise<void> {
    const conversation = prompt.generate();
    const messages = this.prepareMessages(conversation);

    const requestBody = {
      model: this.model,
      messages: [
        { role: "system", content: "You are a helpful coding assistant." },
        ...messages,
      ],
      max_tokens: 10000,
      stream: true,
    };

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

    let buffer = "";
    for await (const chunk of response.body) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the last, possibly incomplete line in the buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.substring(6).trim(); // Use trim() to be safe
          if (data === "[DONE]") {
            return;
          }
          try {
            const json = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              let processedToken = token;
              if (this.anonymizer) {
                processedToken = this.anonymizer.deanonymize(token);
              }
              onToken(processedToken);
            }
          } catch (e) {
            log("Error parsing chunk: " + data);
          }
        }
      }
    }
  }
}