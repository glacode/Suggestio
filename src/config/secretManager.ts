import * as vscode from 'vscode';

export async function getSecret(context: vscode.ExtensionContext, key: string): Promise<string | undefined> {
  return await context.secrets.get(key);
}

export async function storeSecret(context: vscode.ExtensionContext, key: string, value: string): Promise<void> {
  await context.secrets.store(key, value);
}

export async function deleteSecret(context: vscode.ExtensionContext, key: string): Promise<void> {
  await context.secrets.delete(key);
}

export async function updateAPIKey(context: vscode.ExtensionContext, providerKey: string): Promise<void> {
  const secretKey = `${providerKey}_API_KEY`;

  const newApiKey = await vscode.window.showInputBox({
    prompt: `Enter new API key for ${providerKey}`,
    placeHolder: `Your ${providerKey} API key here...`,
    password: true,
    ignoreFocusOut: true
  });

  if (newApiKey && newApiKey.trim() !== '') {
    await storeSecret(context, secretKey, newApiKey.trim());
    vscode.window.showInformationMessage(`API key for ${providerKey} updated.`);
  }
}

export async function getOrRequestAPIKey(context: vscode.ExtensionContext, providerKey: string): Promise<string> {
  const secretKey = `${providerKey}_API_KEY`;

  // Try to retrieve from secrets first
  const storedApiKey = await getSecret(context, secretKey);
  if (storedApiKey) {
    return storedApiKey;
  }

  // If not found, prompt user
  const userApiKey = await promptForAPIKey(providerKey);
  if (userApiKey) {
    await storeSecret(context, secretKey, userApiKey);
    return userApiKey;
  }

  throw new Error(`API key for ${providerKey} is required for this feature to work.`);
}

async function promptForAPIKey(providerKey: string): Promise<string | undefined> {
  return await vscode.window.showInputBox({
    prompt: `Enter your ${providerKey} API Key`,
    placeHolder: `Your ${providerKey} API key here...`,
    password: true,
    ignoreFocusOut: true
  });
}
