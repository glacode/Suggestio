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
  IConfigProvider,
  IVscodeApiLocal,
  IFileDeleter,
  IVSCodeSettings,
  IProfileConfig
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
    getAnonymizerWords: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<string[]>('experimental.anonymizer.words'),
    getAnonymizerEntropy: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('experimental.anonymizer.sensitiveData.allowedEntropy'),
    getAnonymizerMinLength: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('experimental.anonymizer.sensitiveData.minLength'),
    getInlineCompletionEnabled: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<boolean>('inlineCompletion.enabled', true),
    getInlineCompletionSupportedLanguages: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<string[]>('inlineCompletion.supportedLanguages', packageJsonLanguages),
    getInlineCompletionEnableInUntitledEditors: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<boolean>('inlineCompletion.enableInUntitledEditors', false),
    getMaxRetries: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('llm.maxRetries', CONFIG_DEFAULTS.MAX_RETRIES),
    getInitialDelay: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('llm.initialDelay', CONFIG_DEFAULTS.INITIAL_DELAY),
    getMaxSavedChatSessions: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<number>('maxSavedChatSessions', CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS),
    getProfiles: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<Record<string, any>>('profiles') || {},
    getActiveChatProfile: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<string>('activeChatProfile'),
    getActiveCompletionProfile: () => vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri()).get<string>('activeCompletionProfile'),
    deleteProfile: async (profileId: string) => {
      const config = vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri());
      const inspect = config.inspect<Record<string, any>>('profiles');
      
      // Update Global (User) settings
      const globalProfiles = { ...(inspect?.globalValue || {}) };
      if (globalProfiles[profileId]) {
        delete globalProfiles[profileId];
        await config.update('profiles', globalProfiles, vscode.ConfigurationTarget.Global);
      }

      // Also try Workspace settings if it exists there
      const workspaceProfiles = { ...(inspect?.workspaceValue || {}) };
      if (workspaceProfiles[profileId]) {
        delete workspaceProfiles[profileId];
        await config.update('profiles', workspaceProfiles, vscode.ConfigurationTarget.Workspace);
      }
    },
    updateConfig: async (key: string, value: any, global: boolean) => {
      const config = vscode.workspace.getConfiguration('suggestio', getActiveWorkspaceUri());
      await config.update(key, value, global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace);
    },
    onDidChangeConfiguration: (listener) => vscode.workspace.onDidChangeConfiguration(listener)
  };

  const secretManager = new SecretManager({
    get: async (key: string) => await context.secrets.get(key),
    store: async (key: string, value: string) => await context.secrets.store(key, value),
    delete: async (key: string) => await context.secrets.delete(key)
  }, windowProvider);

  const rawConfigs = await readConfig(
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

  const packageJsonLanguages = context.extension.packageJSON.contributes?.inlineCompletions?.map((c: any) => c.language) || [];

  const vsCodeSettings: IVSCodeSettings = {
    maxAgentIterations: vsCodeConfig.get<number>('maxAgentIterations', CONFIG_DEFAULTS.MAX_AGENT_ITERATIONS),
    logLevel: logLevel,
    inlineCompletion: {
      enabled: vsCodeConfig.get<boolean>('inlineCompletion.enabled', true),
      supportedLanguages: vsCodeConfig.get<string[]>('inlineCompletion.supportedLanguages', packageJsonLanguages),
      enableInUntitledEditors: vsCodeConfig.get<boolean>('inlineCompletion.enableInUntitledEditors', false)
    },
    maxRetries: vsCodeConfig.get<number>('llm.maxRetries', CONFIG_DEFAULTS.MAX_RETRIES),
    initialDelay: vsCodeConfig.get<number>('llm.initialDelay', CONFIG_DEFAULTS.INITIAL_DELAY),
    maxSavedChatSessions: vsCodeConfig.get<number>('maxSavedChatSessions', CONFIG_DEFAULTS.MAX_SAVED_CHAT_SESSIONS),
    profiles: vsCodeConfig.get<Record<string, IProfileConfig>>('profiles'),
    activeChatProfile: vsCodeConfig.get<string>('activeChatProfile'),
    activeCompletionProfile: vsCodeConfig.get<string>('activeCompletionProfile')
  };

  const anonymizerEnabled = vsCodeConfig.get<boolean | undefined>('experimental.anonymizer.enabled');
  const anonymizerWords = vsCodeConfig.get<string[] | undefined>('experimental.anonymizer.words');
  const anonymizerEntropy = vsCodeConfig.get<number | undefined>('experimental.anonymizer.sensitiveData.allowedEntropy');
  const anonymizerMinLength = vsCodeConfig.get<number | undefined>('experimental.anonymizer.sensitiveData.minLength');
  
  if (anonymizerEnabled !== undefined || anonymizerWords !== undefined || anonymizerEntropy !== undefined || anonymizerMinLength !== undefined) {
    vsCodeSettings.anonymizer = {
      enabled: anonymizerEnabled,
      words: anonymizerWords,
      sensitiveData: {
        allowedEntropy: anonymizerEntropy,
        minLength: anonymizerMinLength
      }
    };
  }

  const httpClient = new NodeFetchClient();
  const configContainer: IConfigContainer = await configProcessor.processConfig(rawConfigs, secretManager, eventBus, httpClient, vsCodeSettings);
  // Initialize UI context for toggles
  await vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', configContainer.config.inlineCompletion.enabled !== false);
  await vscode.commands.executeCommand('setContext', 'suggestio.autoAcceptEditsEnabled', configContainer.config.autoAcceptEdits);

  eventBus.on('inlineCompletionToggled', (enabled) => {
    vscode.commands.executeCommand('setContext', 'suggestio.inlineCompletionEnabled', enabled);
  });

  eventBus.on('autoAcceptEditsToggled', (enabled) => {
    vscode.commands.executeCommand('setContext', 'suggestio.autoAcceptEditsEnabled', enabled);
  });

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
    configContainer
  );
  const chatHistoryManager = new PersistentChatHistoryManager(baseHistoryManager, storage);

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
    configContainer,
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
    configContainer,
    configProvider,
    secretManager,
    httpClient: new NodeFetchClient(),
    toolUiProvider
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatWebviewViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  registerCompletionProvider(context, configContainer, ignoreManager, eventBus);
  registerCommands(
    context,
    configContainer,
    chatWebviewViewProvider,
    eventBus,
    windowProvider,
    secretManager,
    autoAcceptManager
  );
}

export function deactivate() { }
