import * as vscode from 'vscode';
import { initLogger, log } from './logger.js';
import { readConfig } from './config/config.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';
import * as fs from 'fs';
import * as path from 'path';
import { 
  IWorkspaceProvider, 
  IFileContentReader, 
  IFileContentWriter,
  ConfigContainer, 
  IDirectoryReader, 
  IDirectoryCreator,
  IAnonymizationEventPayload, 
  IWindowProvider, 
  IPathResolver,
  IDocumentOpener
} from './types.js';
import { ChatHistoryManager } from './chat/chatHistoryManager.js';
import { SecretManager } from './config/secretManager.js';
import { configProcessor } from './config/configProcessor.js';
import { Agent } from './agent/agent.js';
import { ChatWebviewViewProvider } from './chat/chatWebviewViewProvider.js';
import { getTools } from './agent/tools.js';
import { ContextBuilder } from './chat/context.js';
import { IgnoreManager } from './chat/ignoreManager.js';
import { getChatWebviewContent } from './chat/chatWebviewContent.js';
import './chat/activeEditorTracker.js';
import { EventBus } from './utils/eventBus.js';
import { ANONYMIZATION_EVENT } from './anonymizer/anonymizationNotifier.js';
import { NodeFetchClient } from './utils/httpClient.js';

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  log("Suggestio: Activate");
  vscode.window.showInformationMessage("Suggestio Activated!");

  const eventBus = new EventBus();

  eventBus.on(ANONYMIZATION_EVENT, (payload: IAnonymizationEventPayload) => {
    log(`[Anonymizer] Anonymized '${payload.original}' to '${payload.placeholder}' (Reason: ${payload.type})`);
  });

  const workspaceProvider: IWorkspaceProvider = {
    rootPath: () => {
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
      return undefined;
    }
  };

  const directoryReader: IDirectoryReader = {
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
    exists: (path: string) => fs.existsSync(path),
  };

  const directoryCreator: IDirectoryCreator = {
    mkdir: (path: string, options?: { recursive: boolean }) => fs.mkdirSync(path, options)
  };

  const fileContentReader: IFileContentReader = {
    read: (filePath: string) => {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
      return undefined;
    },
  };

  const fileContentWriter: IFileContentWriter = {
    write: (filePath: string, content: string) => fs.writeFileSync(filePath, content)
  };

  const windowProvider: IWindowProvider = {
    showErrorMessage: (message: string) => vscode.window.showErrorMessage(message),
    showInformationMessage: (message: string) => vscode.window.showInformationMessage(message),
    showTextDocument: async (doc: any) => { await vscode.window.showTextDocument(doc); },
    showInputBox: async (options) => await vscode.window.showInputBox(options),
    showQuickPick: async (items, options) => await vscode.window.showQuickPick(items, options)
  };

  const pathResolver: IPathResolver = path;

  const secretManager = new SecretManager({
    get: async (key: string) => await context.secrets.get(key),
    store: async (key: string, value: string) => await context.secrets.store(key, value),
    delete: async (key: string) => await context.secrets.delete(key)
  }, windowProvider);

  const rawJson = await readConfig(
    context,
    workspaceProvider,
    fileContentReader,
    directoryReader,
    windowProvider,
    pathResolver
  );
  const vsCodeConfig = vscode.workspace.getConfiguration('suggestio');
  const overrides = {
    maxAgentIterations: vsCodeConfig.get<number>('maxAgentIterations')
  };
  const configContainer: ConfigContainer = await configProcessor.processConfig(rawJson, secretManager, eventBus, new NodeFetchClient(), overrides);
  // Initialize UI context for inline completion toggle (default true in config)
  await vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', configContainer.config.enableInlineCompletion !== false);

  const conversationHistory = new ChatHistoryManager();
  const chatHistoryManager = conversationHistory;

  const documentOpener: IDocumentOpener = {
    openTextDocument: async (path: string) => await vscode.workspace.openTextDocument(path)
  };

  const logicHandler = new Agent({
    config: configContainer.config,
    log,
    chatHistoryManager,
    tools: getTools(workspaceProvider, { ...directoryReader, ...directoryCreator }, pathResolver),
    eventBus
  });
  const providerAccessor = {
    getModels: () => Object.values(configContainer.config.providers).map(p => p.model),
    getActiveModel: () => configContainer.config.providers[configContainer.config.activeProvider].model,
  };

  const ignoreManager = new IgnoreManager(workspaceProvider, fileContentReader, pathResolver);

  const chatWebviewViewProvider = new ChatWebviewViewProvider({
    extensionContext: context,
    providerAccessor,
    logicHandler,
    chatHistoryManager: chatHistoryManager,
    buildContext: new ContextBuilder(vscode.window, ignoreManager),
    getChatWebviewContent,
    vscodeApi: vscode,
    fileReader: fileContentReader,
    eventBus,
    anonymizer: configContainer.config.anonymizerInstance
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatWebviewViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, configContainer.config, ignoreManager);
  registerCommands(
    context,
    configContainer.config,
    chatWebviewViewProvider,
    eventBus,
    pathResolver,
    directoryReader,
    directoryCreator,
    fileContentWriter,
    documentOpener,
    windowProvider,
    secretManager
  );


}

export function deactivate() { }