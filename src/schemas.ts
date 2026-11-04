import { z } from "zod";

/**
 * Zod schema for a tool call request from the AI.
 */
export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
  /**
   * Optional field for vendor-specific metadata.
   * For example, Gemini via OpenAI-compatible API requires a 'thought_signature' 
   * (found inside extra_content) to be preserved and re-sent in the conversation 
   * history for subsequent tool-related requests.
   */
  extra_content: z.record(z.string(), z.any()).optional(),
  /**
   * Present only when the arguments text could not be parsed as a JSON object
   * and was replaced by the damaged-arguments stub: the underlying JSON.parse
   * error, which the agent reports back to the model verbatim.
   */
  argumentsParseError: z.string().optional(),
  /**
   * The verbatim arguments text as the model emitted it, captured before the
   * repair replaced it, so the agent's tool result can show the model its
   * own broken bytes instead of the repaired stub.
   */
  originalDamagedArguments: z.string().optional(),
});

/**
 * Represents a tool call request from the AI, inferred from the Zod schema.
 */
export type ToolCall = z.infer<typeof ToolCallSchema>;
