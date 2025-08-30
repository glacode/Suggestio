import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export async function editGlobalConfig(
  context: vscode.ExtensionContext,
  currentConfig: object
) {
  const storagePath = context.globalStorageUri.fsPath;
  const configFile = path.join(storagePath, "config.json");

  // Ensure the file exists, initialized with current config
  if (!fs.existsSync(configFile)) {
    fs.mkdirSync(storagePath, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(currentConfig, null, 2));
  }

  // Open the config file in the editor
  const doc = await vscode.workspace.openTextDocument(configFile);
  await vscode.window.showTextDocument(doc);
}
