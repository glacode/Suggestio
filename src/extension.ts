import * as vscode from 'vscode';
import { initLogger, defaultLogger, parseLogLevel } from './log/logger.js';
import { readConfig } from './config/config.js';
import { registerCompletionProvider } from './registrations/completionRegistration.js';
import { registerCommands } from './registrations/commandRegistration.js';
import { registerConfigHandler } from './registrations/configRegistration.js';
import * as fs from 'fs';
import { FileContentReader } from './utils/FileContentReader.js';
import * as path from 'path';
import { 
  IWorkspaceProvider, 
  IFileReadProvider,
  IFileContentWriter,
  IConfigContainer, 
  IDirectoryReader, 
  IDirectoryCreator,
  IAnonymizationEventPayload, 
  IWindowProvider, 
  IPathResolver,
  IDocumentOpener,
  IConfigProvider,
  IVscodeApiLocal,
  IFileDeleter
} from './types.js';
import { ChatHistoryManager } from './chat/chatHistoryManager.js';
import { WorkspaceChatHistoryStorage } from './chat/workspaceChatHistoryStorage.js';
import { PersistentChatHistoryManager } from './chat/persistentChatHistoryManager.js';
import { SecretManager } from './config/secretManager.js';
import { configProcessor, getChatProfileIds } from './config/configProcessor.js';
import { CONFIG_DEFAULTS } from './constants/config.js';
import { Agent } from './agent/agent.js';
import { ChatWebviewViewProvider } from './chat/chatWebviewViewProvider.js';
import { ToolUiProvider } from './chat/toolUiProvider.js';
import { getTools } from './tools/index.js';
import { WorkspaceScanner } from './utils/workspaceScanner.js';
import { ContextBuilder } from './chat/context.js';
import { IgnoreManager } from './chat/ignoreManager.js';
import { getChatWebviewContent } from './chat/chatWebviewContent.js';
import './chat/activeEditorTracker.js';
import { EventBus } from './utils/eventBus.js';
import { EventLogHandler } from './log/eventLogHandler.js';
import { ANONYMIZATION_EVENT } from './anonymizer/anonymizationNotifier.js';
import { NodeFetchClient } from './utils/httpClient.js';
import { EXTENSION_MESSAGES, EXTENSION_LOGS } from './constants/messages.js';
import { DiffManager } from './utils/diffManager.js';
import { NodeCommandExecutor } from './utils/commandExecutor.js';
import { CommandBlacklistValidator } from './utils/commandValidator.js';
import { CommandAutoAcceptManager } from './utils/commandAutoAcceptManager.js';

export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  defaultLogger.info(EXTENSION_LOGS.ACTIVATE);
  vscode.window.showInformationMessage(EXTENSION_MESSAGES.ACTIVATED);

  const vscodeApiLocal: IVscodeApiLocal = {
    Uri: vscode.Uri,
    commands: vscode.commands,
    window: {
      tabGroups: vscode.window.tabGroups
    }
  };

  const diffManager = new DiffManager(vscodeApiLocal);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DiffManager.scheme, {
      provideTextDocumentContent: (uri) => diffManager.getContent(uri.toString())
    })
  );

  const eventBus = new EventBus();
  new EventLogHandler(eventBus, defaultLogger);

  eventBus.on(ANONYMIZATION_EVENT, (payload: IAnonymizationEventPayload) => {
    eventBus.emit('log', { 
      level: 'info', 
      message: EXTENSION_LOGS.ANONYMIZED(payload.original, payload.placeholder, payload.type) 
    });
  });

  const getActiveWorkspaceUri = () => vscode.workspace.workspaceFolders?.[0]?.uri;

  const workspaceProvider: IWorkspaceProvider = {
    rootPath: () => getActiveWorkspaceUri()?.fsPath,
    rootUri: () => getActiveWorkspaceUri(),
    storagePath: () => context.storageUri?.fsPath
  };

  const directoryReader: IDirectoryReader = {
    readdir: (path: string) => {
      try {
        if (fs.existsSync(path)) {
            return fs.readdirSync(path);
        }
      } catch (e) {
          defaultLogger.info(EXTENSION_LOGS.DIRECTORY_READ_ERROR(path, e));
      }
      return undefined;
    },
    exists: (path: string) => fs.existsSync(path),
    isDirectory: (path: string) => {
      try {
        return fs.statSync(path).isDirectory();
      } catch (e) {
        return false;
      }
    },
  };

  const directoryCreator: IDirectoryCreator = {
    mkdir: (path: string, options?: { recursive: boolean }) => fs.mkdirSync(path, options)
  };

  const nodeFileReadProvider: IFileReadProvider = {
    existsSync: (path: string) => fs.existsSync(path),
    readFileSync: (path: string, encoding: any) => fs.readFileSync(path, encoding).toString(),
  };

  const fileContentReader = new FileContentReader(nodeFileReadProvider);

  const fileContentWriter: IFileContentWriter = {
    write: (filePath: string, content: string) => fs.writeFileSync(filePath, content)
  };

  const fileDeleter: IFileDeleter = {
    delete: (filePath: string) => fs.unlinkSync(filePath)
  };

  const windowProvider: IWindowProvider = {
    showErrorMessage: (message: string) => vscode.window.showErrorMessage(message),
    showInformationMessage: (message: string) => vscode.window.showInformationMessage(message),
    showTextDocument: async (doc: any) => { await vscode.window.showTextDocument(doc); },
    showInputBox: async (options) => await vscode.window.showInputBox(options),
    showQuickPick: async (items, options) => await vscode.window.showQuickPick(items, options)
  };

  const pathResolver: IPathResolver = path;

  const configProvider: IConfigProvider = {
    getLogLevel: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<string>('logLevel', CONFIG_DEFAULTS.LOG_LEVEL),
    getMaxAgentIterations: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('maxAgentIterations', CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS),
    getAnonymizerEnabled: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<boolean | undefined>('experimental.anonymizer.enabled'),
    getEnableInlineCompletion: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<boolean>('enableInlineCompletion', true),
    getMaxRetries: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('llm.maxRetries', CONFIG_DEFAULTS.MAX_RETRIES),
    getInitialDelay: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('llm.initialDelay', CONFIG_DEFAULTS.INITIAL_DELAY),
    getMaxSavedChatSessions: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('maxSavedChatSessions', CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS),
    onDidChangeConfiguration: (listener) => vscode.workspace.onDidChangeConfiguration(listener)
  };

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

  const vsCodeConfig = vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri());

  const logLevel = vsCodeConfig.get<string>('logLevel', CONFIG_DEFAULTS.LOG_LEVEL);
  defaultLogger.setLogLevel(parseLogLevel(logLevel));

  const overrides: any = {
    maxAgentIterations: vsCodeConfig.get<number>('maxAgentIterations', CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS),
    logLevel: logLevel,
    enableInlineCompletion: vsCodeConfig.get<boolean>('enableInlineCompletion', true),
    maxRetries: vsCodeConfig.get<number>('llm.maxRetries', CONFIG_DEFAULTS.MAX_RETRIES),
    initialDelay: vsCodeConfig.get<number>('llm.initialDelay', CONFIG_DEFAULTS.INITIAL_DELAY),
    maxSavedChatSessions: vsCodeConfig.get<number>('maxSavedChatSessions', CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS)
  };

  const anonymizerEnabled = vsCodeConfig.get<boolean | undefined>('experimental.anonymizer.enabled');
  if (anonymizerEnabled !== undefined) {
    overrides.anonymizer = {
      enabled: anonymizerEnabled
    };
  }

  const httpClient = new NodeFetchClient();
  const configContainer: IConfigContainer = await configProcessor.processConfig(rawJson, secretManager, eventBus, httpClient, overrides);
  // Initialize UI context for toggles
  await vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', configContainer.config.enableInlineCompletion !== false);
  await vscode.commands.executeCommand('setContext', 'suggestio.autoAcceptEditsEnabled', configContainer.config.autoAcceptEdits);

  registerConfigHandler(context.subscriptions, configProvider, configContainer, eventBus, secretManager, httpClient);

  const baseHistoryManager = new ChatHistoryManager();
  const storage = new WorkspaceChatHistoryStorage(
    workspaceProvider,
    fileContentReader,
    fileContentWriter,
    pathResolver,
    directoryCreator,
    directoryReader,
    fileDeleter,
    configContainer.config
  );
  const chatHistoryManager = new PersistentChatHistoryManager(baseHistoryManager, storage);

  const documentOpener: IDocumentOpener = {
    openTextDocument: async (path: string) => await vscode.workspace.openTextDocument(path)
  };

  const ignoreManager = new IgnoreManager(workspaceProvider, fileContentReader, pathResolver);
  const workspaceScanner = new WorkspaceScanner(workspaceProvider, directoryReader, pathResolver, ignoreManager);
  const commandExecutor = new NodeCommandExecutor();
  const commandValidator = new CommandBlacklistValidator();
  const autoAcceptManager = new CommandAutoAcceptManager();

  const tools = getTools(
    workspaceProvider,
    fileContentReader,
    fileContentWriter,
    pathResolver,
    eventBus,
    ignoreManager,
    workspaceScanner,
    commandExecutor,
    commandValidator,
    configContainer.config, // Acts as IAutoAcceptProvider
    autoAcceptManager
  );

  const toolUiProvider = new ToolUiProvider(tools);

  const agent = new Agent({
    config: configContainer.config,
    chatHistoryManager,
    tools,
    eventBus
  });
  const providerAccessor = {
    getProfiles: () => getChatProfileIds(configContainer.config.profiles),
    getActiveProfile: () => configContainer.config.activeChatProfile,
    getCompletionProfiles: () => Object.entries(configContainer.config.profiles).map(([id]) => id),
    getCompletionActiveProfile: () => configContainer.config.activeCompletionProfile || configContainer.config.activeChatProfile
  };

  const chatWebviewViewProvider = new ChatWebviewViewProvider({
    extensionContext: context,
    profileAccessor: providerAccessor,
    chatAgent: agent,
    chatHistoryManager: chatHistoryManager,
    buildContext: new ContextBuilder(vscode.window, ignoreManager, workspaceProvider, pathResolver),
    getChatWebviewContent,
    vscodeApi: vscode,
    fileReader: fileContentReader,
    eventBus,
    diffManager,
    anonymizer: configContainer.config.anonymizerInstance,
    config: configContainer.config,
    secretManager,
    httpClient: new NodeFetchClient(),
    toolUiProvider
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatWebviewViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, configContainer.config, ignoreManager, eventBus);
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
    secretManager,
    autoAcceptManager
  );
}

export function deactivate() { }
