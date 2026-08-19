import type {
    IConfigProvider,
    ISecretManager,
    IHttpClient,
    IConfigContainer,
    IEventBus,
    WebviewMessage
} from '../../types.js';
import { WEBVIEW_COMMANDS } from '../../constants/protocol.js';
import { configProcessor } from '../../config/configProcessor.js';
import type { IWebviewCommandHandler } from '../chatCommandHandler.js';

/**
 * Handler for profile-related commands.
 * Manages chat profiles, API keys, and profile configuration.
 */
export class ProfileCommandHandler implements IWebviewCommandHandler {
    private readonly _configProvider: IConfigProvider;
    private readonly _secretManager: ISecretManager;
    private readonly _httpClient: IHttpClient;
    private readonly _configContainer: IConfigContainer;
    private readonly _eventBus: IEventBus;

    constructor({
        configProvider,
        secretManager,
        httpClient,
        configContainer,
        eventBus
    }: {
        configProvider: IConfigProvider;
        secretManager: ISecretManager;
        httpClient: IHttpClient;
        configContainer: IConfigContainer;
        eventBus: IEventBus;
    }) {
        this._configProvider = configProvider;
        this._secretManager = secretManager;
        this._httpClient = httpClient;
        this._configContainer = configContainer;
        this._eventBus = eventBus;
    }

    public canHandle(command: string): boolean {
        return command === WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED ||
               command === WEBVIEW_COMMANDS.EDIT_API_KEY ||
               command === WEBVIEW_COMMANDS.DELETE_API_KEY ||
               command === WEBVIEW_COMMANDS.ADD_PROFILE ||
               command === WEBVIEW_COMMANDS.DELETE_PROFILE;
    }

    public async handle(message: WebviewMessage): Promise<void> {
        if (message.command === WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED) {
            await this._handleChatProfileChanged(message);
        } else if (message.command === WEBVIEW_COMMANDS.EDIT_API_KEY) {
            await this._handleEditApiKey(message);
        } else if (message.command === WEBVIEW_COMMANDS.DELETE_API_KEY) {
            await this._handleDeleteApiKey(message);
        } else if (message.command === WEBVIEW_COMMANDS.ADD_PROFILE) {
            await this._handleAddProfile(message);
        } else if (message.command === WEBVIEW_COMMANDS.DELETE_PROFILE) {
            await this._handleDeleteProfile(message);
        }
    }

    private async _handleChatProfileChanged(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED }>): Promise<void> {
        this._eventBus.emit('chatProfileChanged', message.model);
        await this._configProvider.updateConfig('activeChatProfile', message.model, true);
    }

    private async _handleEditApiKey(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.EDIT_API_KEY }>): Promise<void> {
        await this._secretManager.updateAPIKey(message.identifier);
        await configProcessor.updateProviders(
            this._configContainer.config,
            this._eventBus,
            this._secretManager,
            this._httpClient
        );
    }

    private async _handleDeleteApiKey(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.DELETE_API_KEY }>): Promise<void> {
        await this._secretManager.deleteSecret(message.identifier);
        await configProcessor.updateProviders(
            this._configContainer.config,
            this._eventBus,
            this._secretManager,
            this._httpClient
        );
    }

    private async _handleAddProfile(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.ADD_PROFILE }>): Promise<void> {
        const currentProfiles = this._configProvider.getProfiles();
        const { id, ...profileData } = message.profile;
        currentProfiles[id] = profileData;
        await this._configProvider.updateConfig('profiles', currentProfiles, true);
    }

    private async _handleDeleteProfile(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.DELETE_PROFILE }>): Promise<void> {
        await this._configProvider.deleteProfile(message.profileId);
    }
}