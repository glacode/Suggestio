import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { getLlmProvider } from '../providers/providerFactory.js';
import { IConfig, IConfigContainer, IProfileConfig, IHttpClient, IProjectConfig, IRawConfigs } from '../types.js';
import { IEventBus } from '../utils/eventBus.js';
import { createEventLogger } from '../log/eventLogger.js';
import { CONFIG_LOGS } from '../constants/messages.js';
import { CONFIG_DEFAULTS } from '../constants/config.js';

export interface ISecretManager {
    getOrRequestAPIKey(providerKey: string): Promise<string>;
    getSecret(apiKeyPlaceholder: string): Promise<string | undefined>;
    updateAPIKey(apiKeyPlaceholder: string): Promise<void>;
    deleteSecret(apiKeyPlaceholder: string): Promise<void>;
}

/**
 * Service for processing and initializing the extension configuration.
 */
class ConfigProcessor {
    constructor() { }

    /**
     * Process raw config JSON from multiple layers and resolves API keys using a secret manager.
     * Merging order: Default < Global < Workspace < Overrides.
     * @param rawConfigs The raw JSON strings from different configuration layers.
     * @param secretManager The secret manager to resolve API keys.
     * @param eventBus The event bus for communication between components.
     * @param httpClient The HTTP client for provider initialization.
     * @param overrides Optional partial configuration from standard VSCode extension settings.
     */
    public async processConfig(
        rawConfigs: IRawConfigs,
        secretManager: ISecretManager,
        eventBus: IEventBus,
        httpClient: IHttpClient,
        overrides?: any
    ): Promise<IConfigContainer> {
        // 1. Load layers
        const defaultConfig: IProjectConfig = JSON.parse(rawConfigs.default);
        const workspaceConfig: Partial<IProjectConfig> = rawConfigs.workspace ? JSON.parse(rawConfigs.workspace) : {};

        // 2. Perform merge
        // Base config with defaults
        const config: IConfig = {
            ...defaultConfig,
            maxAgentIterations: CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS,
            logLevel: CONFIG_DEFAULTS.LOG_LEVEL,
            toolResultMaxLength: CONFIG_DEFAULTS.TOOL_RESULT_MAX_LENGTH,
            maxRetries: CONFIG_DEFAULTS.MAX_RETRIES,
            initialDelay: CONFIG_DEFAULTS.INITIAL_DELAY,
            enableInlineCompletion: true,
            autoAcceptEdits: CONFIG_DEFAULTS.AUTO_ACCEPT_EDITS,
            maxSavedChatSessions: CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS,
        };

        // Ensure anonymizer section exists
        if (!config.anonymizer) {
            config.anonymizer = { enabled: false, words: [] };
        } else if (config.anonymizer.enabled === undefined) {
            config.anonymizer.enabled = false;
        }
        if (!config.anonymizer.words) {
            config.anonymizer.words = [];
        }

        // Merge profiles (shallow merge of objects)
        config.profiles = {
            ...defaultConfig.profiles,
            ...(workspaceConfig.profiles || {})
        };

        // Merge top-level settings
        if (workspaceConfig.activeChatProfile) { config.activeChatProfile = workspaceConfig.activeChatProfile; }
        if (workspaceConfig.activeCompletionProfile) { config.activeCompletionProfile = workspaceConfig.activeCompletionProfile; }

        // Merge Anonymizer
        const mergeAnonymizer = (target: any, source: any) => {
            if (!source) { return; }
            if (source.enabled !== undefined) { target.enabled = source.enabled; }
            if (source.sensitiveData) { target.sensitiveData = { ...target.sensitiveData, ...source.sensitiveData }; }
            // If the higher layer provides 'words', it REPLACES the lower layer's words.
            // This prevents mixing built-in examples with real user data.
            if (source.words && Array.isArray(source.words) && source.words.length > 0) { 
                target.words = [...source.words]; 
            }
        };

        mergeAnonymizer(config.anonymizer, workspaceConfig.anonymizer);

        // 3. Apply overrides from standard VSCode extension settings
        // These overrides (User settings) take precedence over Default, but Workspace config wins over User settings.
        if (overrides) {
            const { anonymizer, profiles, activeChatProfile, activeCompletionProfile, ...rest } = overrides;
            
            // Standard settings apply over Default
            Object.assign(config, rest);
            
            if (profiles) {
                config.profiles = { ...config.profiles, ...profiles };
            }
            if (activeChatProfile) { config.activeChatProfile = activeChatProfile; }
            if (activeCompletionProfile) { config.activeCompletionProfile = activeCompletionProfile; }

            if (anonymizer) {
                mergeAnonymizer(config.anonymizer, anonymizer);
            }

            // RE-APPLY Workspace settings because they should win over Global VS Code settings
            if (workspaceConfig.profiles) {
                config.profiles = { ...config.profiles, ...workspaceConfig.profiles };
            }
            if (workspaceConfig.activeChatProfile) { config.activeChatProfile = workspaceConfig.activeChatProfile; }
            if (workspaceConfig.activeCompletionProfile) { config.activeCompletionProfile = workspaceConfig.activeCompletionProfile; }
            if (workspaceConfig.anonymizer) {
                mergeAnonymizer(config.anonymizer, workspaceConfig.anonymizer);
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
        secretManager: ISecretManager,
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

        eventBus.removeAllListeners('autoAcceptEditsToggled');
        eventBus.on('autoAcceptEditsToggled', (enabled: boolean) => {
            config.autoAcceptEdits = enabled;
            logger.info(`Auto-accept edits toggled: ${enabled}`);
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
        secretManager: ISecretManager,
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
        secretManager: ISecretManager,
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

/**
 * Returns a list of profile identifiers that are eligible for the chat interface.
 * Profiles are excluded if they explicitly disable tools or are explicitly marked for exclusion.
 */
export function getChatProfileIds(profiles: Record<string, IProfileConfig>): string[] {
    return Object.entries(profiles)
        .filter(([_, profile]) => profile.supportsTools !== false && profile.excludeFromChat !== true)
        .map(([id]) => id);
}

export const configProcessor = new ConfigProcessor();
