import type {
    IConfigProvider,
    IChatWebviewView,
    IWebviewView,
    WebviewMessage,
    IChatCommandHandler,
    IEventBus
} from '../types.js';
import { APP_EVENTS } from '../constants/protocol.js';
import { createEventLogger } from '../log/eventLogger.js';
import { WEBVIEW_COMMANDS } from '../constants/protocol.js';

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
    configProvider: IConfigProvider;
    getAbortController: () => AbortController | undefined;
}

/**
 * `ChatCommandHandler` handles messages sent from the webview and orchestrates
 * the corresponding actions in the extension.
 */
export class ChatCommandHandler implements IChatCommandHandler {
    private readonly _eventBus: IEventBus;
    private readonly _configProvider: IConfigProvider;
    private _view?: IChatWebviewView;

    private readonly _logger: ReturnType<typeof createEventLogger>;
    private readonly _getAbortController: () => AbortController | undefined;
    private readonly _legacyHandler: IWebviewCommandHandler;
    private readonly _handlers: IWebviewCommandHandler[];

    constructor({
        handlers,
        eventBus,
        configProvider,
        getAbortController
    }: IChatCommandHandlerArgs) {
        this._eventBus = eventBus;
        this._configProvider = configProvider;
        this._getAbortController = getAbortController;

        this._logger = createEventLogger(eventBus);

        // Legacy handler handles all commands not covered by specialized handlers.
        // It will be incrementally replaced by dedicated handlers in future commits.
        this._legacyHandler = {
            canHandle: () => true, // handles everything not handled by specialized handlers
            handle: async (message: WebviewMessage) => {
                await this._handleMessageLegacy(message);
            }
        };

        // Specialized handlers are injected; legacy handler is added as fallback.
        this._handlers = [...handlers, this._legacyHandler];
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

    /**
     * Legacy command handling logic — will be split into dedicated handlers.
     */
    private async _handleMessageLegacy(message: WebviewMessage): Promise<void> {
        if (message.command === WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED) {
            this._eventBus.emit(APP_EVENTS.COMPLETION_PROFILE_CHANGED, message.model);
            this._configProvider.updateConfig('activeCompletionProfile', message.model, true);
        }
    }
}
