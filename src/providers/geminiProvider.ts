import fetch from "node-fetch";
import { llmProvider } from "./llmProvider.js";
import { log } from "../logger.js";
import { IPrompt } from "../promptBuilder/prompt.js";
import { ChatMessage } from "../chat/types.js";

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
};

//TODO remove this class after confirming Gemini usage via OpenAI compatible API works fine
/** This provider should be deprecated, because now even Gemini supports an OpenAi compatible API */
export class GeminiProvider implements llmProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gemini-1.5-flash-latest") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async query(prompt: IPrompt): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: this.formatConversation(prompt.generate()),
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

  async queryStream(prompt: IPrompt, onToken: (token: string) => void): Promise<void> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const body = {
      contents: this.formatConversation(prompt.generate()),
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

    if (!res.body) {
      throw new Error("Response body is null");
    }

    let buffer = "";
    for await (const chunk of res.body) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data:")) {
          const jsonStr = line.substring(5).trim();
          if (jsonStr) {
            try {
              const json = JSON.parse(jsonStr);
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                const parts = text.split(/(\s+)/);
                for (const part of parts) {
                  if (part) {
                    onToken(part);
                  }
                }
              }
            } catch (e) {
              log(`Error parsing chunk: ${jsonStr}`);
            }
          }
        }
      }
    }

    if (buffer) {
      const line = buffer;
      if (line.startsWith("data:")) {
        const jsonStr = line.substring(5).trim();
        if (jsonStr) {
          try {
            const json = JSON.parse(jsonStr);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parts = text.split(/(\s+)/);
              for (const part of parts) {
                if (part) {
                  onToken(part);
                }
              }
            }
          } catch (e) {
            log(`Error parsing chunk: ${jsonStr}`);
          }
        }
      }
    }
  }

  private formatConversation(conversation: ChatMessage[]): { role: string; parts: { text: string }[] }[] {
    return conversation.map(message => ({
      role: message.role,
      parts: [{ text: message.content }],
    }));
  }
}