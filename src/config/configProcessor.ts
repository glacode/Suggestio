import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { getLlmProvider } from '../providers/providerFactory.js';
import { IConfig, IConfigContainer, IProfileConfig, IHttpClient } from '../types.js';
import { IEventBus } from '../utils/eventBus.js';
import { createEventLogger } from '../log/eventLogger.js';
import { CONFIG_LOGS } from '../constants/messages.js';

export interface SecretManager {
    getOrRequestAPIKey(providerKey: string): Promise<string>;
    getSecret(apiKeyPlaceholder: string): Promise<string | undefined>;
}

/**
 * Service for processing and initializing the extension configuration.
 */
class ConfigProcessor {
    constructor() { }

    /**
     * Process raw config JSON and resolves API keys using a secret manager.
     * @param rawJson The raw JSON string from the configuration file.
     * @param secretManager The secret manager to resolve API keys.
     * @param eventBus The event bus for communication between components.
     * @param httpClient The HTTP client for provider initialization.
     * @param overrides Optional partial configuration from standard VSCode extension settings.
     */
    public async processConfig(
        rawJson: string,
        secretManager: SecretManager,
        eventBus: IEventBus,
        httpClient: IHttpClient,
        overrides?: any
    ): Promise<IConfigContainer> {
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

        const logger = createEventLogger(eventBus);

        // Register event listeners for live updates to this specific config instance
        this.registerEventListeners(config, eventBus, secretManager, httpClient, logger);

        await this.updateProviders(config, eventBus, secretManager, httpClient);

        return { config };
    }

    private registerEventListeners(
        config: IConfig,
        eventBus: IEventBus,
        secretManager: SecretManager,
        httpClient: IHttpClient,
        logger: ReturnType<typeof createEventLogger>
    ) {
        // Remove existing listeners to avoid duplicates if processConfig is called multiple times
        eventBus.removeAllListeners('chatProfileChanged');
        eventBus.on('chatProfileChanged', async (profileId: string) => {
            logger.info(CONFIG_LOGS.CHAT_PROFILE_CHANGED(profileId));
            if (config.profiles[profileId]) {
                config.activeChatProfile = profileId;
                await this.updateProviders(config, eventBus, secretManager, httpClient);
                logger.info(CONFIG_LOGS.CONFIG_UPDATED_ACTIVE_CHAT_PROFILE(config.activeChatProfile));
            }
        });

        eventBus.removeAllListeners('inlineCompletionToggled');
        eventBus.on('inlineCompletionToggled', (enabled: boolean) => {
            logger.info(CONFIG_LOGS.INLINE_COMPLETION_TOGGLED(enabled));
            config.enableInlineCompletion = enabled;
            logger.info(CONFIG_LOGS.CONFIG_UPDATED_INLINE(config.enableInlineCompletion));
        });

        eventBus.removeAllListeners('completionProfileChanged');
        eventBus.on('completionProfileChanged', async (profileId: string) => {
            logger.info(CONFIG_LOGS.COMPLETION_PROFILE_CHANGED(profileId));
            config.activeCompletionProfile = profileId;
            await this.updateProviders(config, eventBus, secretManager, httpClient);
            logger.info(CONFIG_LOGS.CONFIG_UPDATED_ACTIVE_COMPLETION_PROFILE(config.activeCompletionProfile));
        });
    }

    /**
     * Resolve the API key for a single profile in memory.
     */
    private async resolveAPIKeyInMemory(
        profileConfig: IProfileConfig,
        secretManager: SecretManager,
        forcePrompt: boolean = false
    ) {
        const apiKeyValue = profileConfig.apiKey;
        if (typeof apiKeyValue !== 'string') { return; }

        const match = apiKeyValue.match(/^\$\{(\w+)\}$/);
        const placeholder = match ? match[1] : undefined;
        profileConfig.apiKeyPlaceholder = placeholder;

        if (placeholder) {
            const envValue = process.env[placeholder];
            if (envValue?.trim()) {
                profileConfig.resolvedApiKey = envValue.trim();
            } else {
                profileConfig.resolvedApiKey = forcePrompt
                    ? await secretManager.getOrRequestAPIKey(placeholder)
                    : await secretManager.getSecret(placeholder);
            }
        } else {
            profileConfig.resolvedApiKey = apiKeyValue;
        }
    }

    public async updateProviders(
        config: IConfig,
        eventBus: IEventBus,
        secretManager: SecretManager,
        httpClient: IHttpClient,
        forcePrompt: boolean = false
    ) {
        const { activeChatProfile, activeCompletionProfile, profiles } = config;

        // Resolve API key for active (Chat) profile
        if (activeChatProfile && profiles?.[activeChatProfile]) {
            await this.resolveAPIKeyInMemory(profiles[activeChatProfile], secretManager, forcePrompt);
        }

        // Resolve API key for Completion profile if it's different
        const targetCompletionProfileId = activeCompletionProfile || activeChatProfile;
        if (targetCompletionProfileId && targetCompletionProfileId !== activeChatProfile && profiles?.[targetCompletionProfileId]) {
            await this.resolveAPIKeyInMemory(profiles[targetCompletionProfileId], secretManager, forcePrompt);
        }

        if (!config.anonymizerInstance) {
            config.anonymizerInstance = getAnonymizer(config, eventBus);
        }

        // Initialize providers
        config.llmProviderForChat = getLlmProvider(config, httpClient, eventBus, config.anonymizerInstance, activeChatProfile) ?? undefined;
        config.llmProviderForInlineCompletion = getLlmProvider(config, httpClient, eventBus, config.anonymizerInstance, targetCompletionProfileId) ?? undefined;
    }
}

export const configProcessor = new ConfigProcessor();
