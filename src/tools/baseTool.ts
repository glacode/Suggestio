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
        const userDecisionPromise = new Promise<string>((resolve) => {
            const disposable = eventBus.on('user:confirmationResponse', (payload: IUserConfirmationPayload) => {
                if (payload.toolCallId === toolCallId) {
                    disposable.dispose();
                    resolve(payload.decision);
                }
            });

            if (signal) {
                signal.addEventListener('abort', () => {
                    disposable.dispose();
                    resolve('deny');
                }, { once: true });
            }
        });

        eventBus.emit('agent:requestConfirmation', {
            toolCallId,
            toolName: this.definition.name,
            message,
            diffData
        });

        return await userDecisionPromise;
    }
}
