import { ISecretStorage, IWindowProvider } from '../types.js';
import { CONFIG_MESSAGES } from '../constants/messages.js';

export class SecretManager {
    constructor(
        private readonly secrets: ISecretStorage,
        private readonly windowProvider: IWindowProvider
    ) { }

    public async getSecret(apiKeyIdentifier: string): Promise<string | undefined> {
        return await this.secrets.get(apiKeyIdentifier);
    }

    public async storeSecret(apiKeyIdentifier: string, apiKeyValue: string): Promise<void> {
        await this.secrets.store(apiKeyIdentifier, apiKeyValue);
    }

    public async deleteSecret(apiKeyIdentifier: string): Promise<void> {
        await this.secrets.delete(apiKeyIdentifier);
    }

    public async updateAPIKey(apiKeyIdentifier: string): Promise<void> {
        const newApiKey = await this.windowProvider.showInputBox({
            prompt: CONFIG_MESSAGES.ENTER_NEW_API_KEY(apiKeyIdentifier),
            placeHolder: CONFIG_MESSAGES.API_KEY_PLACEHOLDER(apiKeyIdentifier),
            password: true,
            ignoreFocusOut: true
        });

        if (newApiKey && newApiKey.trim() !== '') {
            await this.storeSecret(apiKeyIdentifier, newApiKey.trim());
            this.windowProvider.showInformationMessage(CONFIG_MESSAGES.API_KEY_UPDATED(apiKeyIdentifier));
        }
    }

    public async getOrRequestAPIKey(apiKeyIdentifier: string): Promise<string> {
        // Try to retrieve from secrets first
        const storedApiKey = await this.getSecret(apiKeyIdentifier);
        if (storedApiKey) {
            return storedApiKey;
        }

        // If not found, prompt user
        const userApiKey = await this.promptForAPIKey(apiKeyIdentifier);
        if (userApiKey) {
            await this.storeSecret(apiKeyIdentifier, userApiKey);
            return userApiKey;
        }

        throw new Error(CONFIG_MESSAGES.API_KEY_REQUIRED(apiKeyIdentifier));
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
    const apiKeyIdentifier = await windowProvider.showQuickPick(providerApiKeys, {
        placeHolder: CONFIG_MESSAGES.SELECT_API_KEY_TO_UPDATE
    });
    if (apiKeyIdentifier) {
        await secretManager.updateAPIKey(apiKeyIdentifier);
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
    const apiKeyIdentifier = await windowProvider.showQuickPick(providerApiKeys, {
        placeHolder: CONFIG_MESSAGES.SELECT_API_KEY_TO_DELETE
    });
    if (apiKeyIdentifier) {
        await secretManager.deleteSecret(apiKeyIdentifier);
        windowProvider.showInformationMessage(CONFIG_MESSAGES.API_KEY_DELETED(apiKeyIdentifier));
    }
}