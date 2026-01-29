import { ISecretStorage, IWindowProvider } from '../types.js';

export class SecretManager {
    constructor(
        private readonly secrets: ISecretStorage,
        private readonly windowProvider: IWindowProvider
    ) { }

    public async getSecret(apiKeyPlaceholder: string): Promise<string | undefined> {
        return await this.secrets.get(apiKeyPlaceholder);
    }

    public async storeSecret(apiKeyPlaceholder: string, apiKeyValue: string): Promise<void> {
        await this.secrets.store(apiKeyPlaceholder, apiKeyValue);
    }

    public async deleteSecret(apiKeyPlaceholder: string): Promise<void> {
        await this.secrets.delete(apiKeyPlaceholder);
    }

    public async updateAPIKey(apiKeyPlaceholder: string): Promise<void> {
        const newApiKey = await this.windowProvider.showInputBox({
            prompt: `Enter new API key for ${apiKeyPlaceholder}`,
            placeHolder: `Your ${apiKeyPlaceholder} API key here...`,
            password: true,
            ignoreFocusOut: true
        });

        if (newApiKey && newApiKey.trim() !== '') {
            await this.storeSecret(apiKeyPlaceholder, newApiKey.trim());
            this.windowProvider.showInformationMessage(`API key for ${apiKeyPlaceholder} updated.`);
        }
    }

    public async getOrRequestAPIKey(apiKeyPlaceholder: string): Promise<string> {
        // Try to retrieve from secrets first
        const storedApiKey = await this.getSecret(apiKeyPlaceholder);
        if (storedApiKey) {
            return storedApiKey;
        }

        // If not found, prompt user
        const userApiKey = await this.promptForAPIKey(apiKeyPlaceholder);
        if (userApiKey) {
            await this.storeSecret(apiKeyPlaceholder, userApiKey);
            return userApiKey;
        }

        throw new Error(`API key for ${apiKeyPlaceholder} is required for this feature to work.`);
    }

    private async promptForAPIKey(providerKey: string): Promise<string | undefined> {
        return await this.windowProvider.showInputBox({
            prompt: `Enter your ${providerKey} API Key`,
            placeHolder: `Your ${providerKey} API key here...`,
            password: true,
            ignoreFocusOut: true
        });
    }
}

/**
* Command handler: update API key after selecting provider
*/
export async function handleUpdateApiKeyCommand(
    secretManager: SecretManager, 
    windowProvider: IWindowProvider,
    providerApiKeys: string[]
): Promise<void> {
    const apiKeyPlaceholder = await windowProvider.showQuickPick(providerApiKeys, {
        placeHolder: 'Select an API key to update'
    });
    if (apiKeyPlaceholder) {
        await secretManager.updateAPIKey(apiKeyPlaceholder);
    }
}

/**
* Command handler: delete API key after selecting provider
*/
export async function handleDeleteApiKeyCommand(
    secretManager: SecretManager, 
    windowProvider: IWindowProvider,
    providerApiKeys: string[]
): Promise<void> {
    const apiKeyPlaceholder = await windowProvider.showQuickPick(providerApiKeys, {
        placeHolder: 'Select an API key to delete'
    });
    if (apiKeyPlaceholder) {
        await secretManager.deleteSecret(apiKeyPlaceholder);
        windowProvider.showInformationMessage(`API key value for ${apiKeyPlaceholder} deleted.`);
    }
}