import fetch from "node-fetch";
import { llmProvider } from "./llmProvider.js";
import { log } from "../logger.js";

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
};

export class GeminiProvider implements llmProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gemini-1.5-flash-latest") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async query(prompt: string): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error: ${res.status} - ${errText}`);
    }

    const data = (await res.json()) as GeminiResponse;
    log("Response:" + JSON.stringify(data, null, 2));

    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
      null
    );
  }
}