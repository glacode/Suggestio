import { IReasoningProcessor, IReasoningDelta } from "../types.js";

/**
 * Standard implementation of IReasoningProcessor.
 * Handles:
 * - Standard OpenAI 'reasoning' and 'reasoning_content' fields.
 * - Google/Gemma4 'extra_content.google.thought' flag.
 * - Stripping of <thought> and </thought> tags.
 */
export class StandardReasoningProcessor implements IReasoningProcessor {
    /**
     * Processes a delta object to extract and clean content and reasoning tokens.
     * @param delta The delta object from the LLM response.
     * @returns An object containing the processed tokens.
     */
    process(delta: any): IReasoningDelta {
        const hasContent = delta.content !== undefined && delta.content !== null;
        const hasReasoning = (delta.reasoning !== undefined && delta.reasoning !== null) || 
                           (delta.reasoning_content !== undefined && delta.reasoning_content !== null);

        let content: string | undefined = hasContent ? delta.content : undefined;
        let reasoning: string | undefined = hasReasoning ? (delta.reasoning || delta.reasoning_content) : undefined;

        // Handle Gemma4 extra_content flag
        const isGoogleThought = delta.extra_content?.google?.thought === true;
        if (isGoogleThought && content !== undefined && !reasoning) {
            reasoning = content;
            content = undefined;
        }

        // Clean tokens by stripping tags
        const cleanedReasoning = reasoning !== undefined ? this.stripThoughtTags(reasoning) : undefined;
        const cleanedContent = content !== undefined ? this.stripThoughtTags(content) : undefined;

        return {
            content: cleanedContent,
            reasoning: cleanedReasoning,
        };
    }

    /**
     * Strips <thought> and </thought> tags from a token.
     * Gemma4 often includes these tags even when it uses the metadata flag.
     * @param token The token to clean.
     * @returns The cleaned token.
     */
    private stripThoughtTags(token: string): string {
        if (!token) { return ""; }
        return token
            .replace(/<thought>/g, "")
            .replace(/<\/thought>/g, "");
    }

    /**
     * Formats a chat message for inclusion in the conversation history sent to the LLM.
     * Wraps reasoning in <thought> tags and merges it into content, as most
     * OpenAI-compatible APIs do not support a separate reasoning field in the input.
     * @param message The internal chat message.
     * @returns A message object formatted for the LLM provider.
     */
    prepareHistoryMessage(message: any): any {
        const { role, content, reasoning, tool_calls, tool_call_id } = message;
        let finalContent = content || "";

        if (reasoning && role === 'assistant') {
            // Merge reasoning into content using tags for LLM context
            finalContent = `<thought>\n${reasoning}\n</thought>\n${finalContent}`;
        }

        return {
            role,
            content: finalContent,
            tool_calls,
            tool_call_id
        };
    }
}
