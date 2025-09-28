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
}