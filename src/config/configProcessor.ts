import { Config, ProviderConfig } from './types.js';

export interface SecretManager {
    getOrRequestAPIKey(providerKey: string): Promise<string>;
}

/**
 * Resolve the API key for a single provider in memory.
 * Populates `apiKeyPlaceholder` and `resolvedApiKey`.
 */
export async function resolveAPIKeyInMemory(
    providerKey: string,
    providerConfig: ProviderConfig,
    secretManager: SecretManager
) {
    const apiKeyValue = providerConfig.apiKey;

    if (typeof apiKeyValue !== 'string') { return; }

    const match = apiKeyValue.match(/^\$\{(\w+)\}$/);
    const placeholder = match ? match[1] : undefined;
    providerConfig.apiKeyPlaceholder = placeholder;

    if (placeholder) {
        const envValue = process.env[placeholder];
        providerConfig.resolvedApiKey = envValue?.trim() || await secretManager.getOrRequestAPIKey(placeholder);
    } else if (apiKeyValue.trim() === '') {
        providerConfig.resolvedApiKey = await secretManager.getOrRequestAPIKey(providerKey);
    } else {
        providerConfig.resolvedApiKey = apiKeyValue;
    }
}

/**
 * Process raw config JSON and resolves API keys using a secret manager.
 */
export async function processConfig(rawJson: string, secretManager: SecretManager): Promise<Config> {
    const config: Config = JSON.parse(rawJson);

    const { activeProvider, providers } = config;

    if (activeProvider && providers?.[activeProvider]) {
        await resolveAPIKeyInMemory(activeProvider, providers[activeProvider], secretManager);
    }

    return config;
}