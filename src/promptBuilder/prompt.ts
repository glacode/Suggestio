import { ChatHistory } from "../chat/types.js";

/**
 * The `Prompt` interface defines a contract for objects responsible for generating
 * a `ChatHistory` (an array of `ChatMessage`s) that can be sent to an LLM.
 *
 * It serves a higher-level purpose than just storing messages (like `ChatHistoryManager`).
 * While `ChatHistoryManager` *stores* the complete ongoing conversation, `Prompt`
 * encapsulates the *logic* for constructing a specific, LLM-ready prompt
 * by potentially selecting, formatting, and augmenting messages from the history
 * or other sources (e.g., system instructions, current user input, code context).
 * 
 * For example when it's time to generate a *new* response from the LLM, the `Prompt`
 * implementation takes the current user input, possibly some selected *parts* of the
 * `ChatHistoryManager`'s stored history (e.g., the last N turns), and any
 * system-level instructions, then combines them into a single, cohesive `ChatHistory`
 * object that is *optimized* for the LLM.
 *
 * This abstraction allows for flexible and extensible strategies for building
 * different types of prompts without duplicating logic or tightly coupling
 * prompt creation to specific LLM providers or chat contexts.
 */
export interface IPrompt {
  generate(): ChatHistory;
}
