import fetch from "node-fetch";
import { llmProvider } from "./llmProvider.js";
import { Anonymizer } from "../anonymizer/anonymizer.js";
import { log } from "../logger.js";

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

  async query(prompt: string): Promise<string | null> {
    const processedPrompt = this.anonymizer
      ? this.anonymizer.anonymize(prompt)
      : prompt;

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
          { role: "user", content: processedPrompt },
        ],
        max_tokens: 10000,
      }),
    });

    const json = (await response.json()) as OpenAIResponse;
    log("Response:" + JSON.stringify(json, null, 2));

    let content = json.choices?.[0]?.message?.content?.trim() || null;
    if (content && this.anonymizer) {
      content = this.anonymizer.deanonymize(content);
    }

    return content;
  }

    async queryStream(prompt: string, onToken: (token: string) => void): Promise<void> {
      const processedPrompt = this.anonymizer
        ? this.anonymizer.anonymize(prompt)
        : prompt;

      const requestBody = {
        model: this.model,
        messages: [
          { role: "system", content: "You are a helpful coding assistant." },
          { role: "user", content: processedPrompt },
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