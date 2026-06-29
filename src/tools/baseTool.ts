import { z } from 'zod';
import { IToolImplementation, IToolDefinition, IToolResult, IEventBus, IUserConfirmationPayload, IToolConfirmationPayload, IConfigContainer } from '../types.js';
import { APP_EVENTS } from '../constants/protocol.js';

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
     * Optional provider to check if tool edits should be automatically accepted.
     */
    protected configContainer?: IConfigContainer;

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
     * @param options Optional configuration for the confirmation request.
     * @returns A promise that resolves to the user's decision ('allow' or 'deny').
     */
    protected async requestUserConfirmation(
        toolCallId: string,
        eventBus: IEventBus,
        message: string,
        diffData?: IToolConfirmationPayload['diffData'],
        signal?: AbortSignal,
        options?: { isEdit?: boolean }
    ): Promise<string> {
        // Bypass confirmation if auto-accept is enabled for edits
        if (options?.isEdit && this.configContainer?.config.autoAcceptEdits) {
            // Notify the UI that the tool is starting immediately since we are bypassing confirmation.
            eventBus.emit(APP_EVENTS.AGENT_TOOL_EXECUTION_STARTED, { toolCallId });
            return 'allow';
        }

        // We create the Promise FIRST to register the 'on' listener before emitting the request.
        // This prevents a race condition where the response might arrive (e.g., in tests or 
        // extremely fast UIs) before we've started listening for it.
        const userDecisionPromise = new Promise<string>((resolve) => {
            const disposable = eventBus.on(APP_EVENTS.USER_CONFIRMATION_RESPONSE, (payload: IUserConfirmationPayload) => {
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
        eventBus.emit(APP_EVENTS.AGENT_REQUEST_CONFIRMATION, {
            toolCallId,
            toolName: this.definition.name,
            message,
            diffData
        });

        // Finally, we wait for either the user's decision or a cancellation signal.
        const decision = await userDecisionPromise;

        // If the tool was allowed to run, notify the UI to start the spinner.
        if (decision === 'allow' || decision === 'always-allow-edit' || decision === 'always-allow-command') {
            eventBus.emit(APP_EVENTS.AGENT_TOOL_EXECUTION_STARTED, { toolCallId });
        }

        return decision;
    }
}
