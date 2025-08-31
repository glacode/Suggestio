import * as vscode from 'vscode';

export async function getSecret(context: vscode.ExtensionContext, apiKeyPlaceholder: string): Promise<string | undefined> {
  return await context.secrets.get(apiKeyPlaceholder);
}

export async function storeSecret(context: vscode.ExtensionContext, apiKeyPlaceholder: string, apiKeyValue: string): Promise<void> {
  await context.secrets.store(apiKeyPlaceholder, apiKeyValue);
}

export async function deleteSecret(context: vscode.ExtensionContext, apiKeyPlaceholder: string): Promise<void> {
  await context.secrets.delete(apiKeyPlaceholder);
}

export async function updateAPIKey(context: vscode.ExtensionContext, apiKeyPlaceholder: string): Promise<void> {
  const newApiKey = await vscode.window.showInputBox({
    prompt: `Enter new API key for ${apiKeyPlaceholder}`,
    placeHolder: `Your ${apiKeyPlaceholder} API key here...`,
    password: true,
    ignoreFocusOut: true
  });

  if (newApiKey && newApiKey.trim() !== '') {
    await storeSecret(context, apiKeyPlaceholder, newApiKey.trim());
    vscode.window.showInformationMessage(`API key for ${apiKeyPlaceholder} updated.`);
  }
}

export async function getOrRequestAPIKey(context: vscode.ExtensionContext, apiKeyPlaceholder: string): Promise<string> {
  // Try to retrieve from secrets first
  const storedApiKey = await getSecret(context, apiKeyPlaceholder);
  if (storedApiKey) {
    return storedApiKey;
  }

  // If not found, prompt user
  const userApiKey = await promptForAPIKey(apiKeyPlaceholder);
  if (userApiKey) {
    await storeSecret(context, apiKeyPlaceholder, userApiKey);
    return userApiKey;
  }

  throw new Error(`API key for ${apiKeyPlaceholder} is required for this feature to work.`);
}

async function promptForAPIKey(providerKey: string): Promise<string | undefined> {
  return await vscode.window.showInputBox({
    prompt: `Enter your ${providerKey} API Key`,
    placeHolder: `Your ${providerKey} API key here...`,
    password: true,
    ignoreFocusOut: true
  });
}

 /**
 * Command handler: update API key after selecting provider
 */
export async function handleUpdateApiKeyCommand(context: vscode.ExtensionContext, providerApiKeys: string[]): Promise<void> {
  const apiKeyPlaceholder = await vscode.window.showQuickPick(providerApiKeys, {
    placeHolder: 'Select an API key to update'
  });
  if (apiKeyPlaceholder) {
    await updateAPIKey(context, apiKeyPlaceholder);
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
    await deleteSecret(context, apiKeyPlaceholder);
    vscode.window.showInformationMessage(`API key value for ${apiKeyPlaceholder} deleted.`);
  }
}