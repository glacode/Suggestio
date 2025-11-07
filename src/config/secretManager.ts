
import * as vscode from 'vscode';

export class SecretManager {
    constructor(private readonly context: vscode.ExtensionContext) { }

    public async getSecret(apiKeyPlaceholder: string): Promise<string | undefined> {
        return await this.context.secrets.get(apiKeyPlaceholder);
    }

    public async storeSecret(apiKeyPlaceholder: string, apiKeyValue: string): Promise<void> {
        await this.context.secrets.store(apiKeyPlaceholder, apiKeyValue);
    }

    public async deleteSecret(apiKeyPlaceholder: string): Promise<void> {
        await this.context.secrets.delete(apiKeyPlaceholder);
    }

    public async updateAPIKey(apiKeyPlaceholder: string): Promise<void> {
        const newApiKey = await vscode.window.showInputBox({
            prompt: `Enter new API key for ${apiKeyPlaceholder}`,
            placeHolder: `Your ${apiKeyPlaceholder} API key here...`,
            password: true,
            ignoreFocusOut: true
        });

        if (newApiKey && newApiKey.trim() !== '') {
            await this.storeSecret(apiKeyPlaceholder, newApiKey.trim());
            vscode.window.showInformationMessage(`API key for ${apiKeyPlaceholder} updated.`);
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
        return await vscode.window.showInputBox({
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
export async function handleUpdateApiKeyCommand(context: vscode.ExtensionContext, providerApiKeys: string[]): Promise<void> {
    const apiKeyPlaceholder = await vscode.window.showQuickPick(providerApiKeys, {
        placeHolder: 'Select an API key to update'
    });
    if (apiKeyPlaceholder) {
        const secretManager = new SecretManager(context);
        await secretManager.updateAPIKey(apiKeyPlaceholder);
    }
}

/**
* Command handler: delete API key after selecting provider
*/
export async function handleDeleteApiKeyCommand(context: vscode.ExtensionContext, providerApiKeys: string[]): Promise<void> {
    const apiKeyPlaceholder = await vscode.window.showQuickPick(providerApiKeys, {
        placeHolder: 'Select an API key to delete'
    });
    if (apiKeyPlaceholder) {
        const secretManager = new SecretManager(context);
        await secretManager.deleteSecret(apiKeyPlaceholder);
        vscode.window.showInformationMessage(`API key value for ${apiKeyPlaceholder} deleted.`);
    }
}
