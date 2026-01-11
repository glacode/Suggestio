import fetch from "node-fetch";
import { log } from "../logger.js";
import { ChatMessage, IAnonymizer, IPrompt, llmProvider } from "../types.js";

type OpenAIResponse = {
  choices?: { message?: { content?: string } }[];
};

export class OpenAICompatibleProvider implements llmProvider {
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

  async query(prompt: IPrompt): Promise<string | null> {
    const conversation = prompt.generateChatHistory();
    const messages = this.prepareMessages(conversation);

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
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
    prompt: IPrompt,
    onToken: (token: string) => void
  ): Promise<void> {
    const conversation = prompt.generateChatHistory();
    const messages = this.prepareMessages(conversation);

    const requestBody = {
      model: this.model,
      messages: messages,
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

    let streamingDeanonymizer;
    if (this.anonymizer) {
        streamingDeanonymizer = this.anonymizer.createStreamingDeanonymizer();
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
             if (streamingDeanonymizer) {
                 const remaining = streamingDeanonymizer.flush();
                 if (remaining) {
                     onToken(remaining);
                 }
             }
            return;
          }
          try {
            const json = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              // If a streaming deanonymizer is active, use it to process the incoming token.
              // This is crucial for handling cases where anonymized placeholders (e.g., "ANON_0")
              // might be split across multiple incoming tokens from the LLM stream.
              // The `process` method buffers tokens and releases deanonymized text
              // only when a full placeholder is recognized or non-sensitive text is confirmed.
              if (streamingDeanonymizer) {
                const { processed } = streamingDeanonymizer.process(token);
                // `processed` contains any deanonymized or confirmed text that is ready to be emitted.
                // The `buffer` (not used here directly) holds partial placeholder matches.
                if (processed) {
                    onToken(processed);
                }
              } else {
                // If no anonymizer is configured, pass the token directly to the consumer.
                onToken(token);
              }
            }
          } catch (e) {
            log("Error parsing chunk: " + data);
          }
        }
      }
    }
  }
}
