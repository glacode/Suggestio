import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { getLlmProvider } from '../providers/providerFactory.js';
import { IConfig, IConfigContainer, IProfileConfig, IHttpClient, IProjectConfig, IRawConfigs, IVSCodeSettings } from '../types.js';
import { IEventBus } from '../utils/eventBus.js';
import { APP_EVENTS } from '../constants/protocol.js';
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
     * @param vsCodeSettings Optional partial configuration from standard VSCode extension settings.
     */
    public async processConfig(
        rawConfigs: IRawConfigs,
        secretManager: ISecretManager,
        eventBus: IEventBus,
        httpClient: IHttpClient,
        vsCodeSettings?: IVSCodeSettings
    ): Promise<IConfigContainer> {
        // 1. Load and merge layers into a final config object
        const config = this.parseAndMergeConfigs(rawConfigs, vsCodeSettings);

        const logger = createEventLogger(eventBus);
        const container: IConfigContainer = { config, rawConfigs };

        // 2. Register event listeners ONCE with the container reference.
        // This ensures they always access the latest config after a sync.
        this.registerEventListeners(container, eventBus, secretManager, httpClient, logger);

        // 3. Resolve keys for active profiles and initialize providers
        await this.updateProviders(container.config, eventBus, secretManager, httpClient);

        return container;
    }

    /**
     * Authority for updating the configuration state.
     * Re-runs the full merging logic to ensure the config is a clean reflection of all layers.
     */
    public async syncConfig(
        container: IConfigContainer,
        vsCodeSettings: IVSCodeSettings,
        eventBus: IEventBus,
        secretManager: ISecretManager,
        httpClient: IHttpClient
    ) {
        const newConfig = this.parseAndMergeConfigs(container.rawConfigs, vsCodeSettings);
        
        // Preserve state that isn't part of the static config stack
        newConfig.anonymizerInstance = container.config.anonymizerInstance;
        
        // Update the reference in the container. Existing event listeners will 
        // automatically see the new configuration because they hold the container.
        container.config = newConfig;

        // Re-resolve and re-initialize
        await this.updateProviders(container.config, eventBus, secretManager, httpClient);
    }

    /**
     * Orchestrates the merging of raw configuration sources into a single IConfig object.
     * 
     * Precedence Order:
     * 1. Default (Bundled config.json)
     * 2. VS Code Settings (User & Workspace levels, merged by VS Code API)
     * 3. Project Config (suggestio.config.json in workspace root)
     * 
     * Precedence: Default < VS Code Settings < Project Config.
     */
    private parseAndMergeConfigs(rawConfigs: IRawConfigs, vsCodeSettings?: IVSCodeSettings): IConfig {
        const defaultConfig: IProjectConfig = JSON.parse(rawConfigs.default);
        const workspaceJsonConfigFile: Partial<IProjectConfig> = rawConfigs.workspaceJsonConfigFile 
            ? JSON.parse(rawConfigs.workspaceJsonConfigFile) 
            : {};

        // Initialize the config object with defaults
        const config = this.initializeBaseConfig(defaultConfig);
        
        if (vsCodeSettings) {
            // Apply VS Code settings first, then Project config to ensure the file wins.
            this.applyOverrides(config, vsCodeSettings, workspaceJsonConfigFile);
        } else {
            // Apply Project config directly if no VS Code overrides exist.
            this.applyWorkspaceConfig(config, workspaceJsonConfigFile);
        }

        // Ensure active pointers are valid, falling back to bundled defaults if necessary.
        this.sanitizeActiveProfiles(
            config, 
            defaultConfig.activeChatProfile, 
            defaultConfig.activeCompletionProfile
        );

        return config;
    }

    /**
     * Ensures that activeChatProfile and activeCompletionProfile point to valid IDs.
     * If a pointed profile is missing (e.g. was just deleted), falls back to a valid one.
     */
    private sanitizeActiveProfiles(config: IConfig, defaultChat?: string, defaultCompletion?: string): void {
        const profileIds = Object.keys(config.profiles || {});
        if (profileIds.length === 0) { return; }

        // 1. Sanitize Chat Profile
        if (config.activeChatProfile && !config.profiles[config.activeChatProfile]) {
            config.activeChatProfile = (defaultChat && config.profiles[defaultChat]) 
                ? defaultChat 
                : profileIds[0];
        }

        // 2. Sanitize Completion Profile
        if (config.activeCompletionProfile && !config.profiles[config.activeCompletionProfile]) {
            config.activeCompletionProfile = (defaultCompletion && config.profiles[defaultCompletion]) 
                ? defaultCompletion 
                : (config.activeChatProfile || profileIds[0]);
        }
    }

    /**
     * Creates the initial configuration object based on default settings.
     */
    private initializeBaseConfig(defaultConfig: IProjectConfig): IConfig {
        const config: IConfig = {
            ...defaultConfig,
            maxAgentIterations: CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS,
            logLevel: CONFIG_DEFAULTS.LOG_LEVEL,
            disableSanitizer: false,
            toolResultMaxLength: CONFIG_DEFAULTS.TOOL_RESULT_MAX_LENGTH,
            maxRetries: CONFIG_DEFAULTS.MAX_RETRIES,
            initialDelay: CONFIG_DEFAULTS.INITIAL_DELAY,
            inlineCompletion: {
                enabled: CONFIG_DEFAULTS.INLINE_COMPLETION_ENABLED,
                // Spread is used to create a mutable copy of the readonly constant array to satisfy IConfig's string[] type
                supportedLanguages: [...CONFIG_DEFAULTS.INLINE_COMPLETION_SUPPORTED_LANGUAGES],
                enableInUntitledEditors: CONFIG_DEFAULTS.INLINE_COMPLETION_ENABLE_IN_UNTITLED_EDITORS
            },
            autoAcceptEdits: CONFIG_DEFAULTS.AUTO_ACCEPT_EDITS,
            maxSavedChatSessions: CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS,
        };

        // Tag initial bundled profiles
        if (config.profiles) {
            Object.values(config.profiles).forEach(p => {
                if (!p.origin) { p.origin = 'bundled'; }
            });
        }

        this.ensureAnonymizerDefaults(config);
        
        return config;
    }

    /**
     * Ensures the anonymizer section is properly initialized with default values.
     */
    private ensureAnonymizerDefaults(config: IConfig): void {
        if (!config.anonymizer) {
            config.anonymizer = { 
                enabled: false, 
                words: [],
                sensitiveData: { 
                    allowedEntropy: CONFIG_DEFAULTS.ANONYMIZER_ALLOWED_ENTROPY, 
                    minLength: CONFIG_DEFAULTS.ANONYMIZER_MIN_LENGTH 
                }
            };
        } else {
            if (config.anonymizer.enabled === undefined) {
                config.anonymizer.enabled = false;
            }
            if (!config.anonymizer.words) {
                config.anonymizer.words = [];
            }
            if (!config.anonymizer.sensitiveData) {
                config.anonymizer.sensitiveData = { 
                    allowedEntropy: CONFIG_DEFAULTS.ANONYMIZER_ALLOWED_ENTROPY, 
                    minLength: CONFIG_DEFAULTS.ANONYMIZER_MIN_LENGTH 
                };
            }
        }
    }

    /**
     * Applies settings from the workspace configuration layer.
     */
    private applyWorkspaceConfig(config: IConfig, workspaceConfig: Partial<IProjectConfig>): void {
        if (!workspaceConfig) { return; }

        // Merge profiles (shallow merge of objects)
        if (workspaceConfig.profiles) {
            // Tag workspace profiles
            Object.values(workspaceConfig.profiles).forEach(p => p.origin = 'project');

            config.profiles = {
                ...config.profiles,
                ...workspaceConfig.profiles
            };
        }

        // Merge top-level settings
        if (workspaceConfig.activeChatProfile) { config.activeChatProfile = workspaceConfig.activeChatProfile; }
        if (workspaceConfig.activeCompletionProfile) { config.activeCompletionProfile = workspaceConfig.activeCompletionProfile; }

        // Merge Inline Completion settings
        if (workspaceConfig.inlineCompletion) {
            if (workspaceConfig.inlineCompletion.enabled !== undefined) {
                config.inlineCompletion.enabled = workspaceConfig.inlineCompletion.enabled;
            }
            if (workspaceConfig.inlineCompletion.supportedLanguages) {
                config.inlineCompletion.supportedLanguages = [...workspaceConfig.inlineCompletion.supportedLanguages];
            }
            if (workspaceConfig.inlineCompletion.enableInUntitledEditors !== undefined) {
                config.inlineCompletion.enableInUntitledEditors = workspaceConfig.inlineCompletion.enableInUntitledEditors;
            }
        }

        // Merge Anonymizer settings
        this.mergeAnonymizer(config.anonymizer, workspaceConfig.anonymizer);
    }

    /**
     * Applies overrides from VS Code settings and ensures Project Config file maintains priority.
     */
    private applyOverrides(config: IConfig, vsCodeSettings: IVSCodeSettings, workspaceJsonConfigFile: Partial<IProjectConfig>): void {
        const { anonymizer, profiles, activeChatProfile, activeCompletionProfile, inlineCompletion, debug, ...rest } = vsCodeSettings;
        
        // 1. VS Code settings apply over Default
        Object.assign(config, rest);

        if (debug?.security?.disableSanitizer !== undefined) {
            config.disableSanitizer = debug.security.disableSanitizer;
        }
        
        if (profiles) {
            // Tag incoming user profiles
            Object.values(profiles).forEach(p => p.origin = 'user');
            config.profiles = { ...config.profiles, ...profiles };
        }
        if (activeChatProfile) { config.activeChatProfile = activeChatProfile; }
        if (activeCompletionProfile) { config.activeCompletionProfile = activeCompletionProfile; }

        if (inlineCompletion) {
            if (inlineCompletion.enabled !== undefined) {
                config.inlineCompletion.enabled = inlineCompletion.enabled;
            }
            if (inlineCompletion.supportedLanguages) {
                config.inlineCompletion.supportedLanguages = [...inlineCompletion.supportedLanguages];
            }
            if (inlineCompletion.enableInUntitledEditors !== undefined) {
                config.inlineCompletion.enableInUntitledEditors = inlineCompletion.enableInUntitledEditors;
            }
        }

        if (anonymizer) {
            this.mergeAnonymizer(config.anonymizer, anonymizer);
        }

        // 2. RE-APPLY Project Config because it MUST win over VS Code settings
        this.applyWorkspaceConfig(config, workspaceJsonConfigFile);
    }

    /**
     * Specialized merge logic for the anonymizer configuration.
     */
    private mergeAnonymizer(target: any, source: any): void {
        if (!source) { return; }
        if (source.enabled !== undefined) { target.enabled = source.enabled; }
        
        if (source.sensitiveData) {
            if (!target.sensitiveData) { target.sensitiveData = {}; }
            if (source.sensitiveData.allowedEntropy !== undefined) {
                target.sensitiveData.allowedEntropy = source.sensitiveData.allowedEntropy;
            }
            if (source.sensitiveData.minLength !== undefined) {
                target.sensitiveData.minLength = source.sensitiveData.minLength;
            }
        }
        
        // If the higher layer provides 'words', it REPLACES the lower layer's words.
        if (source.words && Array.isArray(source.words) && source.words.length > 0) { 
            target.words = [...source.words]; 
        }
    }

    private registerEventListeners(
        container: IConfigContainer,
        eventBus: IEventBus,
        secretManager: ISecretManager,
        httpClient: IHttpClient,
        logger: ReturnType<typeof createEventLogger>
    ) {
        eventBus.on(APP_EVENTS.CHAT_PROFILE_CHANGED, async (profileId: string) => {
            logger.info(CONFIG_LOGS.CHAT_PROFILE_CHANGED(profileId));
            if (container.config.profiles[profileId]) {
                container.config.activeChatProfile = profileId;
                await this.updateProviders(container.config, eventBus, secretManager, httpClient);
                logger.info(CONFIG_LOGS.CONFIG_UPDATED_ACTIVE_CHAT_PROFILE(container.config.activeChatProfile));
            }
        });

        eventBus.on(APP_EVENTS.INLINE_COMPLETION_TOGGLED, (enabled: boolean) => {
            logger.info(CONFIG_LOGS.INLINE_COMPLETION_TOGGLED(enabled));
            container.config.inlineCompletion.enabled = enabled;
            logger.info(CONFIG_LOGS.CONFIG_UPDATED_INLINE(container.config.inlineCompletion.enabled));
        });

        eventBus.on(APP_EVENTS.AUTO_ACCEPT_EDITS_TOGGLED, (enabled: boolean) => {
            container.config.autoAcceptEdits = enabled;
            logger.info(`Auto-accept edits toggled: ${enabled}`);
        });

        eventBus.on(APP_EVENTS.COMPLETION_PROFILE_CHANGED, async (profileId: string) => {
            logger.info(CONFIG_LOGS.COMPLETION_PROFILE_CHANGED(profileId));
            container.config.activeCompletionProfile = profileId;
            await this.updateProviders(container.config, eventBus, secretManager, httpClient);
            logger.info(CONFIG_LOGS.CONFIG_UPDATED_ACTIVE_COMPLETION_PROFILE(container.config.activeCompletionProfile));
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
        if (profileConfig.isApiKeyRequired === false) {
            profileConfig.resolvedApiKey = "";
            return;
        }

        const identifier = profileConfig.apiKeyIdentifier;
        if (typeof identifier !== 'string' || !identifier) {
            profileConfig.resolvedApiKey = undefined;
            return;
        }

        const envValue = process.env[identifier];
        if (envValue?.trim()) {
            profileConfig.resolvedApiKey = envValue.trim();
            return;
        }

        const storedSecret = await secretManager.getSecret(identifier);
        if (storedSecret && !forcePrompt) {
            profileConfig.resolvedApiKey = storedSecret;
        } else if (forcePrompt) {
            profileConfig.resolvedApiKey = await secretManager.getOrRequestAPIKey(identifier);
        } else {
            // Key is not in env and not in secret manager
            profileConfig.resolvedApiKey = undefined;
        }
    }

    /**
     * Resolve API keys for currently active profiles.
     */
    private async resolveActiveProfileKeys(
        config: IConfig,
        secretManager: ISecretManager,
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
    }

    /**
     * Initialize the anonymizer and LLM provider instances.
     */
    private initializeProviders(
        config: IConfig,
        eventBus: IEventBus,
        httpClient: IHttpClient
    ) {
        // Always refresh the anonymizer instance to pick up live configuration changes
        config.anonymizerInstance = getAnonymizer(config, eventBus);

        const { activeChatProfile, activeCompletionProfile } = config;
        const targetCompletionProfileId = activeCompletionProfile || activeChatProfile;

        // Initialize providers
        config.llmProviderForChat = getLlmProvider(config, httpClient, eventBus, config.anonymizerInstance, activeChatProfile) ?? undefined;
        config.llmProviderForInlineCompletion = getLlmProvider(config, httpClient, eventBus, config.anonymizerInstance, targetCompletionProfileId) ?? undefined;
    }

    public async updateProviders(
        config: IConfig,
        eventBus: IEventBus,
        secretManager: ISecretManager,
        httpClient: IHttpClient,
        forcePrompt: boolean = false
    ) {
        await this.resolveActiveProfileKeys(config, secretManager, forcePrompt);
        this.initializeProviders(config, eventBus, httpClient);
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
