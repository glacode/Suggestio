import { ISecretStorage, IWindowProvider } from '../types.js';
import { CONFIG_MESSAGES } from '../constants/messages.js';

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
            prompt: CONFIG_MESSAGES.ENTER_NEW_API_KEY(apiKeyPlaceholder),
            placeHolder: CONFIG_MESSAGES.API_KEY_PLACEHOLDER(apiKeyPlaceholder),
            password: true,
            ignoreFocusOut: true
        });

        if (newApiKey && newApiKey.trim() !== '') {
            await this.storeSecret(apiKeyPlaceholder, newApiKey.trim());
            this.windowProvider.showInformationMessage(CONFIG_MESSAGES.API_KEY_UPDATED(apiKeyPlaceholder));
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

        throw new Error(CONFIG_MESSAGES.API_KEY_REQUIRED(apiKeyPlaceholder));
    }

    private async promptForAPIKey(providerKey: string): Promise<string | undefined> {
        return await this.windowProvider.showInputBox({
            prompt: CONFIG_MESSAGES.ENTER_API_KEY(providerKey),
            placeHolder: CONFIG_MESSAGES.API_KEY_PLACEHOLDER(providerKey),
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
        placeHolder: CONFIG_MESSAGES.SELECT_API_KEY_TO_UPDATE
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
        placeHolder: CONFIG_MESSAGES.SELECT_API_KEY_TO_DELETE
    });
    if (apiKeyPlaceholder) {
        await secretManager.deleteSecret(apiKeyPlaceholder);
        windowProvider.showInformationMessage(CONFIG_MESSAGES.API_KEY_DELETED(apiKeyPlaceholder));
    }
}