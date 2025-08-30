// registrations/commandRegistration.ts
import * as vscode from 'vscode';
import { editGlobalConfig } from '../config/editGlobalConfig.js';
import { Config } from '../config/types.js';

export function registerCommands(context: vscode.ExtensionContext, config: Config) {
  context.subscriptions.push(
    vscode.commands.registerCommand("suggestio.editGlobalConfig", () =>
      editGlobalConfig(context, config)
    )
  );
}
