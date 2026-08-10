import type {
    IConfigProvider,
    IEventBus,
    WebviewMessage
} from '../../types.js';
import { WEBVIEW_COMMANDS } from '../../constants/protocol.js';
import { APP_EVENTS } from '../../constants/protocol.js';
import type { IWebviewCommandHandler } from '../chatCommandHandler.js';

/**
 * Handler for completion profile-related commands.
 * Manages completion profile switching.
 */
export class CompletionCommandHandler implements IWebviewCommandHandler {
    private readonly _configProvider: IConfigProvider;
    private readonly _eventBus: IEventBus;

    constructor({
        configProvider,
        eventBus
    }: {
        configProvider: IConfigProvider;
        eventBus: IEventBus;
    }) {
        this._configProvider = configProvider;
        this._eventBus = eventBus;
    }

    public canHandle(command: string): boolean {
        return command === WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED;
    }

    public async handle(message: WebviewMessage): Promise<void> {
        if (message.command === WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED) {
            await this._handleCompletionProfileChanged(message);
        }
    }

    private async _handleCompletionProfileChanged(
        message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED }>
    ): Promise<void> {
        this._eventBus.emit(APP_EVENTS.COMPLETION_PROFILE_CHANGED, message.model);
        await this._configProvider.updateConfig('activeCompletionProfile', message.model, true);
    }
}