import { getAnonymizer } from '../anonymizer/anonymizer.js';
import { getActiveProvider } from '../providers/providerFactory.js';
import { ConfigContainer, Config, IProviderConfig } from '../types.js';
import { EventEmitter } from 'events';
import { log } from '../logger.js';

export interface SecretManager {
    getOrRequestAPIKey(providerKey: string): Promise<string>;
}

class ConfigProcessor {
    private _config: Config | undefined;
    private _secretManager: SecretManager | undefined;
    private _eventBus: EventEmitter | undefined;

    constructor() {
    }

    public init(config: Config, secretManager: SecretManager, eventBus: EventEmitter) {
        this._config = config;
        this._secretManager = secretManager;
        this._eventBus = eventBus;
        
        // Remove existing listeners to avoid duplicates if init is called multiple times
        this._eventBus.removeAllListeners('modelChanged');
        this._eventBus.on('modelChanged', (modelName: string) => {
            log('modelChanged event received for model: ' + modelName);
            this.updateActiveProvider(modelName);
        });

        // Listen for inline completion toggles and update the in-memory config accordingly
        this._eventBus.removeAllListeners('inlineCompletionToggled');
        this._eventBus.on('inlineCompletionToggled', (enabled: boolean) => {
            log('inlineCompletionToggled event received: ' + enabled);
            if (this._config) {
                this._config.enableInlineCompletion = enabled;
                log('config updated. enableInlineCompletion: ' + this._config.enableInlineCompletion);
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
     */
    public async processConfig(rawJson: string, secretManager: SecretManager, eventBus: EventEmitter): Promise<ConfigContainer> {
        const config: Config = JSON.parse(rawJson);
        this.init(config, secretManager, eventBus);

        await this.updateProviders(config);

        return { config };
    }

    private async updateProviders(config: Config) {
        if (!this._eventBus) {
             throw new Error('EventBus is not initialized');
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
        config.llmProviderForInlineCompletion = getActiveProvider(config, config.anonymizerInstance) ?? undefined;
        config.llmProviderForChat = getActiveProvider(config, config.anonymizerInstance) ?? undefined;
    }

    private async updateActiveProvider(modelName: string) {
        if (!this._config) {
            return;
        }

        const providerEntry = Object.entries(this._config.providers)
            .find(([_, config]) => config.model === modelName);

        if (providerEntry) {
            const [providerId] = providerEntry;
            this._config.activeProvider = providerId;
            await this.updateProviders(this._config);
            log('config updated. activeProvider: ' + this._config.activeProvider);
        }
    }
}
export const configProcessor = new ConfigProcessor();