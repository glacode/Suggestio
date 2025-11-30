import { getActiveProvider } from '../providers/providerFactory.js';
import { ConfigContainer, Config, ProviderConfig } from './types.js';
import { eventBus } from '../events/eventBus.js';
import { log } from '../logger.js';

export interface SecretManager {
    getOrRequestAPIKey(providerKey: string): Promise<string>;
}

class ConfigProcessor {
    private _config: Config | undefined;
    private _secretManager: SecretManager | undefined;

    constructor() {
        eventBus.on('modelChanged', (modelName: string) => {
            log('modelChanged event received for model: ' + modelName);
            this.updateActiveProvider(modelName);
        });
    }

    public init(config: Config, secretManager: SecretManager) {
        this._config = config;
        this._secretManager = secretManager;
    }

    /**
     * Resolve the API key for a single provider in memory.
     * Populates `apiKeyPlaceholder` and `resolvedApiKey`.
     */
    private async resolveAPIKeyInMemory(
        providerConfig: ProviderConfig,
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
    public async processConfig(rawJson: string, secretManager: SecretManager): Promise<ConfigContainer> {
        const config: Config = JSON.parse(rawJson);
        this.init(config, secretManager);

        await this.updateProviders(config);

        return { config };
    }

    private async updateProviders(config: Config) {
        const { activeProvider, providers } = config;

        if (activeProvider && providers?.[activeProvider]) {
            await this.resolveAPIKeyInMemory(providers[activeProvider]);
        }

        // `getActiveProvider` can return null; `inlineCompletionProvider` expects
        // `llmProvider | undefined`, so normalize null -> undefined to satisfy
        // the TypeScript type.
        config.llmProviderForInlineCompletion = getActiveProvider(config) ?? undefined;
        config.llmProviderForChat = getActiveProvider(config) ?? undefined;
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