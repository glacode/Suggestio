import { z } from 'zod';
import { IToolImplementation, IToolDefinition, IToolResult, IEventBus, IUserConfirmationPayload, IToolConfirmationPayload } from '../types.js';

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
     * @param toolCallId Optional ID of the tool call, used for confirmation handshakes.
     */
    abstract execute(args: T, signal?: AbortSignal, toolCallId?: string): Promise<IToolResult>;

    /**
     * Optional method to return a human-readable description of the tool execution.
     * @param args The arguments passed to the tool.
     */
    formatMessage?(args: T): string;

    /**
     * Helper method to request user confirmation for a tool execution.
     * Centralizes the handshake logic to avoid race conditions and redundancy.
     * 
     * @param toolCallId The unique ID for this tool call.
     * @param eventBus The event bus to communicate with the UI.
     * @param message The message to display to the user.
     * @param diffData Optional data for displaying a diff in the UI.
     * @param signal Optional AbortSignal for cancellation.
     * @returns A promise that resolves to the user's decision ('allow' or 'deny').
     */
    protected async requestUserConfirmation(
        toolCallId: string,
        eventBus: IEventBus,
        message: string,
        diffData?: IToolConfirmationPayload['diffData'],
        signal?: AbortSignal
    ): Promise<string> {
        // We create the Promise FIRST to register the 'on' listener before emitting the request.
        // This prevents a race condition where the response might arrive (e.g., in tests or 
        // extremely fast UIs) before we've started listening for it.
        const userDecisionPromise = new Promise<string>((resolve) => {
            const disposable = eventBus.on('user:confirmationResponse', (payload: IUserConfirmationPayload) => {
                // We only care about the response for THIS specific tool call.
                if (payload.toolCallId === toolCallId) {
                    disposable.dispose(); // Always clean up the listener once resolved.
                    resolve(payload.decision);
                }
            });

            // If the execution is cancelled (e.g., user stops the agent), we immediately 
            // resolve with 'deny' and clean up.
            if (signal) {
                signal.addEventListener('abort', () => {
                    disposable.dispose();
                    resolve('deny');
                }, { once: true });
            }
        });

        // NOW that we are actively listening for the response, we emit the request to the UI.
        eventBus.emit('agent:requestConfirmation', {
            toolCallId,
            toolName: this.definition.name,
            message,
            diffData
        });

        // Finally, we wait for either the user's decision or a cancellation signal.
        return await userDecisionPromise;
    }
}
