import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { getActiveProvider } from '../providers/providerFactory.js';
import { IConfigContainer, Config, IProviderConfig, IHttpClient } from '../types.js';
import { IEventBus } from '../utils/eventBus.js';
import { ILogger, defaultLogger } from '../logger.js';

export interface SecretManager {
    getOrRequestAPIKey(providerKey: string): Promise<string>;
}

class ConfigProcessor {
    private _config: Config | undefined;
    private _secretManager: SecretManager | undefined;
    private _eventBus: IEventBus | undefined;
    private _httpClient: IHttpClient | undefined;
    private _logger: ILogger | undefined;

    constructor() {
    }

    public init(config: Config, secretManager: SecretManager, eventBus: IEventBus, httpClient: IHttpClient, logger: ILogger = defaultLogger) {
        this._config = config;
        this._secretManager = secretManager;
        this._eventBus = eventBus;
        this._httpClient = httpClient;
        this._logger = logger;

        // Remove existing listeners to avoid duplicates if init is called multiple times
        this._eventBus.removeAllListeners('modelChanged');
        this._eventBus.on('modelChanged', (modelName: string) => {
            this._logger?.info('modelChanged event received for model: ' + modelName);
            this.updateActiveProvider(modelName);
        });

        // Listen for inline completion toggles and update the in-memory config accordingly
        this._eventBus.removeAllListeners('inlineCompletionToggled');
        this._eventBus.on('inlineCompletionToggled', (enabled: boolean) => {
            this._logger?.info('inlineCompletionToggled event received: ' + enabled);
            if (this._config) {
                this._config.enableInlineCompletion = enabled;
                this._logger?.info('config updated. enableInlineCompletion: ' + this._config.enableInlineCompletion);
            }
        });
    }

    /**
     * Resolve the API key for a single provider in memory.
     * Populates `apiKeyPlaceholder` and `resolvedApiKey`.
     */
    private async resolveAPIKeyInMemory(
        providerConfig: IProviderConfig,
    ) {
        if (!this._secretManager) {
            throw new Error('SecretManager is not initialized');
        }
        const apiKeyValue = providerConfig.apiKey;

        if (typeof apiKeyValue !== 'string') { return; }

        const match = apiKeyValue.match(/^\$\{(\w+)\}$/);
        const placeholder = match ? match[1] : undefined;
        providerConfig.apiKeyPlaceholder = placeholder;

        if (placeholder) {
            const envValue = process.env[placeholder];
            providerConfig.resolvedApiKey = envValue?.trim() || await this._secretManager.getOrRequestAPIKey(placeholder);
        } else {
            providerConfig.resolvedApiKey = apiKeyValue;
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
    public async processConfig(rawJson: string, secretManager: SecretManager, eventBus: IEventBus, httpClient: IHttpClient, overrides?: Partial<Config>): Promise<IConfigContainer> {
        const config: Config = JSON.parse(rawJson);

        if (overrides) {
            Object.assign(config, overrides);
        }

        this.init(config, secretManager, eventBus, httpClient);

        await this.updateProviders(config);

        return { config };
    }

    private async updateProviders(config: Config) {
        if (!this._eventBus || !this._httpClient || !this._logger) {
            throw new Error('ConfigProcessor is not initialized');
        }

        const { activeProvider, providers } = config;

        if (activeProvider && providers?.[activeProvider]) {
            await this.resolveAPIKeyInMemory(providers[activeProvider]);
        }

        if (!config.anonymizerInstance) {
            config.anonymizerInstance = getAnonymizer(config, this._eventBus);
        }

        // `getActiveProvider` can return null; `inlineCompletionProvider` expects
        // `llmProvider | undefined`, so normalize null -> undefined to satisfy
        // the TypeScript type.
        config.llmProviderForInlineCompletion = getActiveProvider(config, this._httpClient, this._eventBus, this._logger, config.anonymizerInstance) ?? undefined;
        config.llmProviderForChat = getActiveProvider(config, this._httpClient, this._eventBus, this._logger, config.anonymizerInstance) ?? undefined;
    }

    private async updateActiveProvider(modelName: string) {
        if (!this._config || !this._logger) {
            return;
        }

        const providerEntry = Object.entries(this._config.providers)
            .find(([_, config]) => config.model === modelName);

        if (providerEntry) {
            const [providerId] = providerEntry;
            this._config.activeProvider = providerId;
            await this.updateProviders(this._config);
            this._logger.info('config updated. activeProvider: ' + this._config.activeProvider);
        }
    }
}
export const configProcessor = new ConfigProcessor();