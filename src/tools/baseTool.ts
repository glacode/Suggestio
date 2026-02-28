import { z } from 'zod';
import { IToolImplementation, IToolDefinition, IToolResult } from '../types.js';

/**
 * Abstract base class for all tool implementations.
 * Ensures a consistent structure and provides type-safety for tool arguments.
 *
 * @template T The type of the arguments the tool expects.
 */
export abstract class BaseTool<T> implements IToolImplementation<T> {
    /**
     * The metadata definition of the tool, used to describe it to the LLM.
     */
    abstract readonly definition: IToolDefinition;

    /**
     * The Zod schema used to validate the tool arguments at runtime.
     */
    abstract readonly schema: z.ZodType<T>;

    /**
     * The core logic of the tool.
     * @param args Validated tool arguments.
     * @param signal Optional AbortSignal for cancellation.
     */
    abstract execute(args: T, signal?: AbortSignal): Promise<IToolResult>;

    /**
     * Optional method to return a human-readable description of the tool execution.
     * @param args The arguments passed to the tool.
     */
    formatMessage?(args: T): string;
}
