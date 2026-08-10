import type {
    IChatWebviewView,
    IWebviewView,
    WebviewMessage,
    IChatCommandHandler,
    IEventBus
} from '../types.js';
import { createEventLogger } from '../log/eventLogger.js';

/**
 * Context passed to each command handler, containing only the dependencies
 * that are actually needed by multiple handlers.
 */
export interface ICommandContext {
    readonly view: IChatWebviewView;
    readonly webviewView: IWebviewView;
    readonly eventBus: IEventBus;
    readonly logger: ReturnType<typeof createEventLogger>;
}

/**
 * Interface for a handler that processes a specific webview command.
 */
export interface IWebviewCommandHandler {
    /**
     * Returns true if this handler can process the given command.
     */
    canHandle(command: string): boolean;
    /**
     * Processes the command.
     */
    handle(message: WebviewMessage, ctx: ICommandContext): Promise<void>;
}

/**
 * Arguments for the ChatCommandHandler constructor.
 * Handlers are injected to keep this class focused on dispatch logic
 * rather than handler construction.
 */
export interface IChatCommandHandlerArgs {
    handlers: IWebviewCommandHandler[];
    eventBus: IEventBus;
    getAbortController: () => AbortController | undefined;
}

/**
 * `ChatCommandHandler` handles messages sent from the webview and orchestrates
 * the corresponding actions in the extension.
 */
export class ChatCommandHandler implements IChatCommandHandler {
    private readonly _eventBus: IEventBus;
    private _view?: IChatWebviewView;

    private readonly _logger: ReturnType<typeof createEventLogger>;
    private readonly _getAbortController: () => AbortController | undefined;
    private readonly _handlers: IWebviewCommandHandler[];

    constructor({
        handlers,
        eventBus,
        getAbortController
    }: IChatCommandHandlerArgs) {
        this._eventBus = eventBus;
        this._getAbortController = getAbortController;

        this._logger = createEventLogger(eventBus);

        // All commands are now handled by specialized handlers.
        this._handlers = handlers;
    }

    public setView(view: IChatWebviewView): void {
        this._view = view;
    }

    public getAbortController(): AbortController | undefined {
        return this._getAbortController();
    }

    public async handleMessage(message: WebviewMessage, webviewView: IWebviewView): Promise<void> {
        const ctx: ICommandContext = {
            view: this._view!,
            webviewView,
            eventBus: this._eventBus,
            logger: this._logger
        };

        for (const handler of this._handlers) {
            if (handler.canHandle(message.command)) {
                await handler.handle(message, ctx);
                return;
            }
        }
    }
}
