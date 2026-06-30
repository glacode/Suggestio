import type {
    IWebviewView,
    ITokenEventPayload,
    IToolCallEventPayload,
    IToolOutputEventPayload,
    IToolResultEventPayload,
    IToolConfirmationPayload,
    IToolUiProvider,
    IChatWebviewEventBridge
} from '../types.js';
import { IEventBus } from '../utils/eventBus.js';
import { APP_EVENTS } from '../constants/protocol.js';
import { createEventLogger } from '../log/eventLogger.js';
import { CHAT_MESSAGES, AGENT_LOGS } from '../constants/messages.js';
import { EXTENSION_EVENTS, MESSAGE_SENDERS } from '../constants/protocol.js';

/**
 * `ChatWebviewEventBridge` listens to agent events from the `EventBus`
 * and forwards them to the webview UI.
 */
export class ChatWebviewEventBridge implements IChatWebviewEventBridge {
    private _view?: IWebviewView;
    private _getAbortController: () => AbortController | undefined = () => undefined;
    private readonly _toolUiProvider: IToolUiProvider;
    private readonly _eventBus: IEventBus;
    private readonly _logger: ReturnType<typeof createEventLogger>;

    // Store active diff data keyed by toolCallId to handle 'viewDiff' commands
    private _activeDiffs = new Map<string, IToolConfirmationPayload['diffData']>();

    constructor(eventBus: IEventBus, toolUiProvider: IToolUiProvider) {
        this._eventBus = eventBus;
        this._toolUiProvider = toolUiProvider;
        this._logger = createEventLogger(eventBus);

        this._setupListeners();
    }

    public setView(view: IWebviewView | undefined): void {
        this._view = view;
    }

    public setAbortControllerAccessor(accessor: () => AbortController | undefined): void {
        this._getAbortController = accessor;
    }

    public getActiveDiff(toolCallId: string): IToolConfirmationPayload['diffData'] | undefined {
        return this._activeDiffs.get(toolCallId);
    }

    public deleteActiveDiff(toolCallId: string): void {
        this._activeDiffs.delete(toolCallId);
    }

    public sendNotification(text: string | null): void {
        if (this._view) {
            this._view.webview.postMessage({
                sender: MESSAGE_SENDERS.ASSISTANT,
                type: EXTENSION_EVENTS.NOTIFICATION,
                text
            });
        }
    }

    public sendCompletionMessage(): void {
        if (this._view) {
            this._view.webview.postMessage({
                sender: MESSAGE_SENDERS.ASSISTANT,
                type: EXTENSION_EVENTS.COMPLETION,
                text: ''
            });
        }
    }

    private _setupListeners(): void {
        this._eventBus.on(APP_EVENTS.AGENT_MAX_ITERATIONS_REACHED, (payload: { maxIterations: number }) => {
            this._logger.info(AGENT_LOGS.MAX_ITERATIONS_REACHED(payload.maxIterations));
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.HALTED,
                    text: CHAT_MESSAGES.MAX_ITERATIONS_REACHED(payload.maxIterations)
                });
            }
        });

        this._eventBus.on(APP_EVENTS.AGENT_TOKEN, (payload: ITokenEventPayload) => {
            const abortController = this._getAbortController();
            if (abortController?.signal.aborted) {
                return;
            }
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOKENS,
                    text: payload.token,
                    tokenType: payload.type
                });
            }
        });

        this._eventBus.on(APP_EVENTS.AGENT_TOOL_START, (payload: IToolCallEventPayload) => {
            if (this._view) {
                const { displayMessage, uiOptions } = this._toolUiProvider.getToolUI(payload.toolName, payload.args);
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOOL_START,
                    toolCallId: payload.toolCallId,
                    toolName: payload.toolName,
                    displayMessage,
                    args: payload.args,
                    uiOptions
                });
            }
        });

        this._eventBus.on(APP_EVENTS.AGENT_TOOL_OUTPUT, (payload: IToolOutputEventPayload) => {
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOOL_OUTPUT,
                    toolCallId: payload.toolCallId,
                    output: payload.output
                });
            }
        });

        this._eventBus.on(APP_EVENTS.AGENT_TOOL_END, (payload: IToolResultEventPayload) => {
            // Clean up diff data when tool finishes
            this._activeDiffs.delete(payload.toolCallId);

            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOOL_END,
                    toolCallId: payload.toolCallId,
                    toolName: payload.toolName,
                    result: payload.result,
                    success: payload.success
                });
            }
        });

        this._eventBus.on(APP_EVENTS.AGENT_NOTIFICATION, (payload: { text: string | null }) => {
            this.sendNotification(payload.text);
        });

        this._eventBus.on(APP_EVENTS.AGENT_TOOL_EXECUTION_STARTED, (payload: { toolCallId: string }) => {
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOOL_STARTED,
                    toolCallId: payload.toolCallId
                });
            }
        });

        this._eventBus.on(APP_EVENTS.AGENT_REQUEST_CONFIRMATION, (payload: IToolConfirmationPayload) => {
            if (payload.diffData) {
                this._activeDiffs.set(payload.toolCallId, payload.diffData);
            }

            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.REQUEST_CONFIRMATION,
                    toolCallId: payload.toolCallId,
                    toolName: payload.toolName,
                    message: payload.message,
                    diffData: payload.diffData
                });
            }
        });
    }
}
