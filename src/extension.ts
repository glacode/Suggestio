import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { readConfig } from './config/config.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';
import * as fs from 'fs';
import * as path from 'path';
import { IWorkspaceProvider, IFileContentProvider, ConfigContainer, IDirectoryProvider, IAnonymizationEventPayload } from './types.js';
import { ChatHistoryManager } from './chat/chatHistoryManager.js';
import { SecretManager } from './config/secretManager.js';
import { configProcessor } from './config/configProcessor.js';
import { ChatResponder } from './chat/chatResponder.js';
import { ChatWebviewViewProvider } from './chat/chatWebviewViewProvider.js';
import { getTools } from './agent/tools.js';
import { ContextBuilder } from './chat/context.js';
import { IgnoreManager } from './chat/ignoreManager.js';
import { getChatWebviewContent } from './chat/chatWebviewContent.js';
import './chat/activeEditorTracker.js';
import { EventBus } from './utils/eventBus.js';
import { ANONYMIZATION_EVENT } from './anonymizer/anonymizationNotifier.js';

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const eventBus = new EventBus();

  eventBus.on(ANONYMIZATION_EVENT, (payload: IAnonymizationEventPayload) => {
    log(`[Anonymizer] Anonymized '${payload.original}' to '${payload.placeholder}' (Reason: ${payload.type})`);
  });

  const secretManager = new SecretManager(context);
  const rawConfig = await readConfig(context);
  const vsCodeConfig = vscode.workspace.getConfiguration('suggestio');
  const overrides = {
    maxAgentIterations: vsCodeConfig.get<number>('maxAgentIterations')
  };
  const configContainer: ConfigContainer = await configProcessor.processConfig(rawConfig, secretManager, eventBus, overrides);
  // Initialize UI context for inline completion toggle (default true in config)
  await vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', configContainer.config.enableInlineCompletion !== false);

  const conversationHistory = new ChatHistoryManager();
  const chatHistoryManager = conversationHistory;

  const workspaceProvider: IWorkspaceProvider = {
    rootPath: () => {
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
      return undefined;
    }
  };

  const directoryProvider: IDirectoryProvider = {
    readdir: (path: string) => {
      try {
        if (fs.existsSync(path)) {
            return fs.readdirSync(path);
        }
      } catch (e) {
          log(`Error reading directory ${path}: ${e}`);
      }
      return undefined;
    },
    exists: (path: string) => fs.existsSync(path)
  };

  const logicHandler = new ChatResponder(
    configContainer.config,
    log,
    chatHistoryManager,
    getTools(workspaceProvider, directoryProvider, path),
    eventBus
  );
  const providerAccessor = {
    getModels: () => Object.values(configContainer.config.providers).map(p => p.model),
    getActiveModel: () => configContainer.config.providers[configContainer.config.activeProvider].model,
  };

  const fileContentProvider: IFileContentProvider = {
    read: (filePath: string) => {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
      return undefined;
    }
  };

  const ignoreManager = new IgnoreManager(workspaceProvider, fileContentProvider, path);

  const chatWebviewViewProvider: vscode.WebviewViewProvider = new ChatWebviewViewProvider({
    extensionContext: context,
    providerAccessor,
    logicHandler,
    chatHistoryManager: chatHistoryManager,
    buildContext: new ContextBuilder(vscode.window, ignoreManager),
    getChatWebviewContent,
    vscodeApi: vscode,
    eventBus,
    anonymizer: configContainer.config.anonymizerInstance
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatWebviewViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, configContainer.config, ignoreManager);
  registerCommands(context, configContainer.config, chatWebviewViewProvider as ChatWebviewViewProvider, eventBus);


}

export function deactivate() { }
