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
});

/**
 * Represents a tool call request from the AI, inferred from the Zod schema.
 */
export type ToolCall = z.infer<typeof ToolCallSchema>;
