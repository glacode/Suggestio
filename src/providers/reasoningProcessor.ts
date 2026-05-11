import { IReasoningProcessor, IReasoningDelta } from "../types.js";

/**
 * Stateful helper to strip tags that might be fragmented across stream chunks.
 */
class StreamingTagStripper {
    private buffer = "";
    private readonly tags = ["<thought>", "</thought>"];

    /**
     * Processes a token and returns the cleaned version.
     * Buffers partial tags to ensure they are correctly stripped when completed.
     */
    process(token: string): string {
        if (!token) { return ""; }

        let current = this.buffer + token;
        this.buffer = "";

        // 1. Remove complete tags
        for (const tag of this.tags) {
            current = current.split(tag).join("");
        }

        // 2. Check for partial tags at the end of the string
        // We look for the last '<' and see if it could be the start of one of our tags.
        const lastOpenBracket = current.lastIndexOf("<");
        if (lastOpenBracket !== -1) {
            const potentialTag = current.substring(lastOpenBracket);
            const couldBeTag = this.tags.some(tag => tag.startsWith(potentialTag));
            
            if (couldBeTag) {
                // Buffer the potential tag part
                this.buffer = potentialTag;
                current = current.substring(0, lastOpenBracket);
            }
        }

        return current;
    }

    /**
     * Flushes any remaining buffered text.
     */
    flush(): string {
        const remaining = this.buffer;
        this.buffer = "";
        return remaining;
    }
}

/**
 * Standard implementation of IReasoningProcessor.
 * Handles:
 * - Standard OpenAI 'reasoning' and 'reasoning_content' fields.
 * - Google/Gemma4 'extra_content.google.thought' flag.
 * - Stripping of <thought> and </thought> tags (stateful).
 */
export class StandardReasoningProcessor implements IReasoningProcessor {
    private contentStripper = new StreamingTagStripper();
    private reasoningStripper = new StreamingTagStripper();

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

        // Clean tokens by stripping tags (statefully)
        const cleanedReasoning = reasoning !== undefined ? this.reasoningStripper.process(reasoning) : undefined;
        const cleanedContent = content !== undefined ? this.contentStripper.process(content) : undefined;

        return {
            content: cleanedContent,
            reasoning: cleanedReasoning,
        };
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

        // Strip extra_content from tool_calls to ensure compatibility with standard OpenAI APIs
        // and reduce context pollution.
        const cleanedToolCalls = tool_calls?.map((tc: any) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
        }));

        return {
            role,
            content: finalContent,
            tool_calls: cleanedToolCalls,
            tool_call_id
        };
    }
}
