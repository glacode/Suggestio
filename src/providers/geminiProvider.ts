import fetch from "node-fetch";
import { IChatMessage , IPrompt, ILlmProvider } from "../types.js";
import { IEventBus } from "../utils/eventBus.js";
import { LLM_MESSAGES, LLM_LOGS } from "../constants/messages.js";
import { createEventLogger } from "../log/eventLogger.js";

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
};

//TODO remove this class after confirming Gemini usage via OpenAI compatible API works fine
/** This provider should be deprecated, because now even Gemini supports an OpenAi compatible API */
export class GeminiProvider implements ILlmProvider {
  private apiKey: string;
  private model: string;
  private eventBus: IEventBus;

  private logger: ReturnType<typeof createEventLogger>;

  constructor(apiKey: string, eventBus: IEventBus, model = "gemini-1.5-flash-latest") {
    this.apiKey = apiKey;
    this.eventBus = eventBus;
    this.model = model;
    this.logger = createEventLogger(eventBus);
  }

  async query(prompt: IPrompt): Promise<IChatMessage | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: this.formatConversation(prompt.generateChatHistory()),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(LLM_MESSAGES.GEMINI_ERROR(res.status, errText));
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const data = (await res.json()) as GeminiResponse;
    this.logger.info(LLM_LOGS.RESPONSE_RECEIVED(data));

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (content === undefined) {
        return null;
    }
    return { role: "assistant", content };
  }

  async queryStream(prompt: IPrompt, _tools?: any, signal?: AbortSignal): Promise<IChatMessage | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const body = {
      contents: this.formatConversation(prompt.generateChatHistory()),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(LLM_MESSAGES.GEMINI_ERROR(res.status, errText));
    }

    if (!res.body) {
      throw new Error(LLM_MESSAGES.RESPONSE_BODY_NULL);
    }

    let fullContent = "";
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
                fullContent += text;
                const parts = text.split(/(\s+)/);
                for (const part of parts) {
                  if (part) {
                    this.eventBus.emit('agent:token', { token: part, type: 'content' });
                  }
                }
              }
            } catch (e) {
              this.logger.error(LLM_MESSAGES.PARSE_CHUNK_ERROR(jsonStr));
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
              fullContent += text;
              const parts = text.split(/(\s+)/);
              for (const part of parts) {
                if (part) {
                  this.eventBus.emit('agent:token', { token: part, type: 'content' });
                }
              }
            }
          } catch (e) {
            this.logger.error(LLM_MESSAGES.PARSE_CHUNK_ERROR(jsonStr));
          }
        }
      }
    }

    return { role: "assistant", content: fullContent };
  }

  private formatConversation(conversation: IChatMessage[]): { role: string; parts: { text: string }[] }[] {
    return conversation.map(message => ({
      role: message.role,
      parts: [{ text: message.content }],
    }));
  }
}