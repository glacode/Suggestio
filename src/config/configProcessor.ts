import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { getLlmProvider } from '../providers/providerFactory.js';
import { IConfig, IConfigContainer, IProfileConfig, IHttpClient } from '../types.js';
import { IEventBus } from '../utils/eventBus.js';
import { createEventLogger } from '../log/eventLogger.js';
import { CONFIG_LOGS } from '../constants/messages.js';

export interface SecretManager {
    getOrRequestAPIKey(providerKey: string): Promise<string>;
}

class ConfigProcessor {
    private _config: IConfig | undefined;
    private _secretManager: SecretManager | undefined;
    private _eventBus: IEventBus | undefined;
    private _httpClient: IHttpClient | undefined;

    private logger: ReturnType<typeof createEventLogger> | undefined;

    constructor() {
    }

    public init(config: IConfig, secretManager: SecretManager, eventBus: IEventBus, httpClient: IHttpClient) {
        this._config = config;
        this._secretManager = secretManager;
        this._eventBus = eventBus;
        this._httpClient = httpClient;
        this.logger = createEventLogger(eventBus);

        // Remove existing listeners to avoid duplicates if init is called multiple times
        this._eventBus.removeAllListeners('chatProfileChanged');
        this._eventBus.on('chatProfileChanged', (profileId: string) => {
            this.logger?.info(CONFIG_LOGS.CHAT_PROFILE_CHANGED(profileId));
            this.updateActiveProfile(profileId);
        });

        // Listen for inline completion toggles and update the in-memory config accordingly
        this._eventBus.removeAllListeners('inlineCompletionToggled');
        this._eventBus.on('inlineCompletionToggled', (enabled: boolean) => {
            this.logger?.info(CONFIG_LOGS.INLINE_COMPLETION_TOGGLED(enabled));
            if (this._config) {
                this._config.enableInlineCompletion = enabled;
                this.logger?.info(CONFIG_LOGS.CONFIG_UPDATED_INLINE(this._config.enableInlineCompletion));
            }
        });

        this._eventBus.removeAllListeners('completionProfileChanged');
        this._eventBus.on('completionProfileChanged', (profileId: string) => {
            this.logger?.info(CONFIG_LOGS.COMPLETION_PROFILE_CHANGED(profileId));
            if (this._config) {
                this._config.activeCompletionProfile = profileId;
                this.updateProviders(this._config);
                this.logger?.info(CONFIG_LOGS.CONFIG_UPDATED_ACTIVE_COMPLETION_PROFILE(this._config.activeCompletionProfile));
            }
        });
    }

    /**
     * Resolve the API key for a single profile in memory.
     * Populates `apiKeyPlaceholder` and `resolvedApiKey`.
     */
    private async resolveAPIKeyInMemory(
        profileConfig: IProfileConfig,
    ) {
        if (!this._secretManager) {
            throw new Error(CONFIG_LOGS.SECRET_MANAGER_NOT_INITIALIZED);
        }
        const apiKeyValue = profileConfig.apiKey;

        if (typeof apiKeyValue !== 'string') { return; }

        const match = apiKeyValue.match(/^\$\{(\w+)\}$/);
        const placeholder = match ? match[1] : undefined;
        profileConfig.apiKeyPlaceholder = placeholder;

        if (placeholder) {
            const envValue = process.env[placeholder];
            profileConfig.resolvedApiKey = envValue?.trim() || await this._secretManager.getOrRequestAPIKey(placeholder);
        } else {
            profileConfig.resolvedApiKey = apiKeyValue;
        }
    }

    /**
     * Process raw config JSON and resolves API keys using a secret manager.
     * @param rawJson The raw JSON string from the configuration file.
     * @param secretManager The secret manager to resolve API keys.
     * @param eventBus The event bus for communication between components.
     * @param overrides Optional partial configuration coming from standard VSCode extension settings.
     *                  These can override existing properties from the JSON config or provide
     *                  additional properties (e.g., maxAgentIterations) not present in the config file.
     */
    public async processConfig(rawJson: string, secretManager: SecretManager, eventBus: IEventBus, httpClient: IHttpClient, overrides?: any): Promise<IConfigContainer> {
        const config: IConfig = JSON.parse(rawJson);

        // Ensure anonymizer section exists and has a default 'enabled' state
        if (!config.anonymizer) {
            config.anonymizer = { enabled: false, words: [] };
        } else if (config.anonymizer.enabled === undefined) {
            config.anonymizer.enabled = false;
        }

        if (overrides) {
            const { anonymizer, ...rest } = overrides;
            Object.assign(config, rest);
            if (anonymizer) {
                config.anonymizer = { ...config.anonymizer, ...anonymizer };
            }
        }

        this.init(config, secretManager, eventBus, httpClient);

        await this.updateProviders(config);

        return { config };
    }

    private async updateProviders(config: IConfig) {
        if (!this._eventBus || !this._httpClient) {
            throw new Error(CONFIG_LOGS.CONFIG_PROCESSOR_NOT_INITIALIZED);
        }

        const { activeChatProfile, activeCompletionProfile, profiles } = config;

        // Resolve API key for active (Chat) profile
        if (activeChatProfile && profiles?.[activeChatProfile]) {
            await this.resolveAPIKeyInMemory(profiles[activeChatProfile]);
        }

        // Resolve API key for Completion profile if it's different
        const targetCompletionProfileId = activeCompletionProfile || activeChatProfile;
        if (targetCompletionProfileId && targetCompletionProfileId !== activeChatProfile && profiles?.[targetCompletionProfileId]) {
            await this.resolveAPIKeyInMemory(profiles[targetCompletionProfileId]);
        }

        if (!config.anonymizerInstance) {
            config.anonymizerInstance = getAnonymizer(config, this._eventBus);
        }

        // Initialize providers
        config.llmProviderForChat = getLlmProvider(config, this._httpClient, this._eventBus, config.anonymizerInstance, activeChatProfile) ?? undefined;
        config.llmProviderForInlineCompletion = getLlmProvider(config, this._httpClient, this._eventBus, config.anonymizerInstance, targetCompletionProfileId) ?? undefined;
    }

    private async updateActiveProfile(profileId: string) {
        if (!this._config) {
            return;
        }

        if (this._config.profiles[profileId]) {
            this._config.activeChatProfile = profileId;
            await this.updateProviders(this._config);
            this.logger?.info(CONFIG_LOGS.CONFIG_UPDATED_ACTIVE_CHAT_PROFILE(this._config.activeChatProfile));
        }
    }
}
export const configProcessor = new ConfigProcessor();