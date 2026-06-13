import { z } from "zod";
import { IOpenAIResponseParser, ToolCall } from "../types.js";
import { ToolCallSchema } from "../schemas.js";
import { LLM_MESSAGES } from "../constants/messages.js";

/**
 * Zod schema for a non-streaming OpenAI-compatible completion response.
 */
const OpenAIResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().optional().nullable(),
        reasoning: z.string().optional().nullable(),
        reasoning_content: z.string().optional().nullable(),
        tool_calls: z.array(ToolCallSchema).nullish(),
      }).nullish(),
    })
  ).optional(),
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
  }).optional(),
});

/**
 * Zod schema for a tool call in a streaming response.
 */
const OpenAIStreamingToolCallSchema = z.object({
  index: z.number().optional().nullable(),
  id: z.string().optional().nullable(),
  type: z.literal("function").optional().nullable(),
  function: z.object({
    name: z.string().optional().nullable(),
    arguments: z.string().optional().nullable(),
  }).nullish(),
  extra_content: z.record(z.string(), z.any()).nullish(),
});

export type OpenAIStreamingToolCall = z.infer<typeof OpenAIStreamingToolCallSchema>;

/**
 * Zod schema for an incremental change (delta) in a streaming response chunk.
 */
const OpenAIStreamDeltaSchema = z.object({
  content: z.string().optional().nullable(),
  reasoning: z.string().optional().nullable(),
  reasoning_content: z.string().optional().nullable(),
  tool_calls: z.array(OpenAIStreamingToolCallSchema).nullish(),
  extra_content: z.record(z.string(), z.any()).nullish(),
});

export type OpenAIStreamDelta = z.infer<typeof OpenAIStreamDeltaSchema>;

/**
 * Zod schema for a single chunk from an OpenAI-compatible SSE stream.
 */
const OpenAIStreamChunkSchema = z.object({
  choices: z.array(
    z.object({
      delta: OpenAIStreamDeltaSchema.nullish(),
      finish_reason: z.string().optional().nullable(),
    })
  ).nullish(),
});

/**
 * Implementation of IOpenAIResponseParser that uses Zod for validation.
 */
export class OpenAIResponseParser implements IOpenAIResponseParser {
  /**
   * Parses a non-streaming response body.
   */
  parseResponse(json: any): {
    content?: string | null;
    reasoning?: string | null;
    reasoning_content?: string | null;
    tool_calls?: ToolCall[] | null;
  } | null {
    const result = OpenAIResponseSchema.safeParse(json);
    
    if (!result.success) {
      // Check for explicit error field even if schema parsing fails
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

    const message = data.choices[0].message;
    if (!message) {
      return null;
    }

    // Helper to ensure we return ToolCall[] | null without type assertion
    const toolCalls: ToolCall[] | null = message.tool_calls ?? null;

    return {
      content: message.content ?? null,
      reasoning: message.reasoning ?? null,
      reasoning_content: message.reasoning_content ?? null,
      tool_calls: toolCalls,
    };
  }

  /**
   * Parses a single chunk from a streaming response.
   */
  parseStreamChunk(json: any) {
    const result = OpenAIStreamChunkSchema.safeParse(json);
    
    if (!result.success) {
      throw new Error(LLM_MESSAGES.MALFORMED_RESPONSE(result.error.message));
    }

    const choice = result.data.choices?.[0];
    if (!choice) {
      return null;
    }

    return {
      delta: choice.delta,
      finish_reason: choice.finish_reason,
    };
  }
}
