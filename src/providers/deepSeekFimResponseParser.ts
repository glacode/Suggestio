import { z } from "zod";
import { IOpenAIResponseParser, ToolCall } from "../types.js";
import { LLM_MESSAGES } from "../constants/messages.js";

/**
 * Zod schema for a non-streaming DeepSeek FIM completion response.
 * The FIM endpoint returns generated text under `choices[].text` rather than
 * `choices[].message.content`.
 */
const FimResponseSchema = z.object({
  choices: z.array(
    z.object({
      text: z.string().optional().nullable(),
      finish_reason: z.string().optional().nullable(),
    })
  ).optional(),
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
  }).optional(),
});

/**
 * Zod schema for a single chunk from a DeepSeek FIM streaming (SSE) response.
 */
const FimStreamChunkSchema = z.object({
  choices: z.array(
    z.object({
      text: z.string().optional().nullable(),
      finish_reason: z.string().optional().nullable(),
    })
  ).nullish(),
});

/**
 * Response parser for DeepSeek's Fill-In-the-Middle completion endpoint.
 *
 * Maps the legacy completions response shape (`choices[].text`) onto the
 * common parser contract so it can be reused by {@link OpenAICompatibleProvider}.
 */
export class DeepSeekFimResponseParser implements IOpenAIResponseParser {
  parseResponse(json: any): {
    content?: string | null;
    reasoning?: string | null;
    reasoning_content?: string | null;
    tool_calls?: ToolCall[] | null;
  } | null {
    const result = FimResponseSchema.safeParse(json);

    if (!result.success) {
      if (json && typeof json === "object" && "error" in json) {
        const errMsg = typeof json.error === "string"
          ? json.error
          : (json.error?.message || JSON.stringify(json.error));
        throw new Error(LLM_MESSAGES.OPENAI_GENERIC_ERROR(errMsg));
      }
      throw new Error(LLM_MESSAGES.MALFORMED_RESPONSE(result.error.message));
    }

    const data = result.data;

    if (data.error) {
      throw new Error(LLM_MESSAGES.OPENAI_GENERIC_ERROR(data.error.message || JSON.stringify(data.error)));
    }

    if (!data.choices || data.choices.length === 0) {
      throw new Error(LLM_MESSAGES.MISSING_CHOICES);
    }

    return {
      content: data.choices[0].text ?? null,
      reasoning: null,
      reasoning_content: null,
      tool_calls: null,
    };
  }

  parseStreamChunk(json: any): {
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
      tool_calls?: any[] | null;
      extra_content?: Record<string, any> | null;
    } | null;
    finish_reason?: string | null;
  } | null {
    const result = FimStreamChunkSchema.safeParse(json);

    if (!result.success) {
      throw new Error(LLM_MESSAGES.MALFORMED_RESPONSE(result.error.message));
    }

    const choice = result.data.choices?.[0];
    if (!choice) {
      return null;
    }

    // Adapt the FIM `text` field onto the common delta `content` field so the
    // shared stream handler can consume it unchanged.
    return {
      delta: { content: choice.text ?? null },
      finish_reason: choice.finish_reason,
    };
  }
}
