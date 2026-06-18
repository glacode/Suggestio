import type {
    IChatAgent,
    IPersistentChatHistoryManager,
    IContextBuilder,
    IDiffManager,
    IConfigContainer,
    IConfigProvider,
    IHttpClient,
    IToolUiProvider,
    IChatWebviewEventBridge,
    IChatWebviewView,
    IWebviewView,
    WebviewMessage,
    IVscodeApiLocal,
    IChatCommandHandler
} from '../types.js';
import { IEventBus } from '../utils/eventBus.js';
import { createEventLogger } from '../log/eventLogger.js';
import { ChatPrompt } from './chatPrompt.js';
import { CHAT_MESSAGES, AGENT_LOGS, CONFIG_MESSAGES } from '../constants/messages.js';
import { WEBVIEW_COMMANDS, EXTENSION_EVENTS, MESSAGE_SENDERS } from '../constants/protocol.js';
import { configProcessor, ISecretManager } from '../config/configProcessor.js';

/**
 * `ChatCommandHandler` handles messages sent from the webview and orchestrates
 * the corresponding actions in the extension.
 */
export class ChatCommandHandler implements IChatCommandHandler {
    private readonly _chatAgent: IChatAgent;
    private readonly _chatHistoryManager: IPersistentChatHistoryManager;
    private readonly _buildContext: IContextBuilder;
    private readonly _eventBus: IEventBus;
    private readonly _diffManager: IDiffManager;
    private readonly _configContainer: IConfigContainer;
    private readonly _configProvider: IConfigProvider;
    private readonly _secretManager: ISecretManager;
    private readonly _httpClient: IHttpClient;
    private readonly _toolUiProvider: IToolUiProvider;
    private readonly _eventBridge: IChatWebviewEventBridge;
    private readonly _vscodeApi: IVscodeApiLocal;
    private _view?: IChatWebviewView;

    private _abortController?: AbortController;
    private readonly _logger: ReturnType<typeof createEventLogger>;

    constructor(
        chatAgent: IChatAgent,
        chatHistoryManager: IPersistentChatHistoryManager,
        buildContext: IContextBuilder,
        eventBus: IEventBus,
        diffManager: IDiffManager,
        configContainer: IConfigContainer,
        configProvider: IConfigProvider,
        secretManager: ISecretManager,
        httpClient: IHttpClient,
        toolUiProvider: IToolUiProvider,
        eventBridge: IChatWebviewEventBridge,
        vscodeApi: IVscodeApiLocal
    ) {
        this._chatAgent = chatAgent;
        this._chatHistoryManager = chatHistoryManager;
        this._buildContext = buildContext;
        this._eventBus = eventBus;
        this._diffManager = diffManager;
        this._configContainer = configContainer;
        this._configProvider = configProvider;
        this._secretManager = secretManager;
        this._httpClient = httpClient;
        this._toolUiProvider = toolUiProvider;
        this._eventBridge = eventBridge;
        this._vscodeApi = vscodeApi;

        this._logger = createEventLogger(eventBus);
    }

    public setView(view: IChatWebviewView): void {
        this._view = view;
    }

    public getAbortController(): AbortController | undefined {
        return this._abortController;
    }

    public async handleMessage(message: WebviewMessage, webviewView: IWebviewView): Promise<void> {
        if (message.command === WEBVIEW_COMMANDS.SEND_MESSAGE) {
            try {
                // Lazy resolution of API key if missing
                const activeProfile = this._configContainer.config.activeChatProfile;
                const profileConfig = this._configContainer.config.profiles[activeProfile];
                if (profileConfig && !profileConfig.resolvedApiKey && profileConfig.apiKeyIdentifier) {
                    this._eventBus.emit('agent:notification', {
                        text: CONFIG_MESSAGES.WAITING_FOR_API_KEY(profileConfig.apiKeyIdentifier)
                    });

                    await configProcessor.updateProviders(this._configContainer.config, this._eventBus, this._secretManager, this._httpClient, true);
                    if (this._view) {
                        await this._view.pushUpdate();
                    }
                    this._eventBus.emit('agent:notification', { text: null });
                }

                this._abortController = new AbortController();
                this._chatHistoryManager.addMessage({ role: 'user', content: message.text });
                this._chatHistoryManager.persistCurrentSession();

                await this._processAgentRun();
            } catch (error) {
                this._handleAgentError(error, webviewView);
            }
        } else if (message.command === WEBVIEW_COMMANDS.RETRY_LAST_MESSAGE) {
            try {
                this._abortController = new AbortController();
                await this._processAgentRun();
            } catch (error) {
                this._handleAgentError(error, webviewView);
            }
        } else if (message.command === WEBVIEW_COMMANDS.CANCEL_REQUEST) {
            if (this._abortController) {
                this._logger.info(AGENT_LOGS.CANCEL_REQUEST);
                this._abortController.abort();
            }
        } else if (message.command === WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL) {
            if (message.decision === 'always-allow-edit') {
                await this._vscodeApi.commands.executeCommand('suggestio.enableAutoAcceptEdits');
            }
            if (message.decision === 'deny') {
                const diffData = this._eventBridge.getActiveDiff(message.toolCallId);
                if (diffData) {
                    await this._diffManager.closeDiff(diffData.filePath);
                }
            }
            this._eventBus.emit('user:confirmationResponse', {
                toolCallId: message.toolCallId,
                decision: message.decision
            });
        } else if (message.command === WEBVIEW_COMMANDS.VIEW_DIFF) {
            const diffData = this._eventBridge.getActiveDiff(message.toolCallId);
            if (diffData) {
                await this._diffManager.showDiff(diffData.filePath, diffData.oldContent, diffData.newContent);
            }
        } else if (message.command === WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED) {
            this._eventBus.emit('chatProfileChanged', message.model);
            await this._configProvider.updateConfig('activeChatProfile', message.model, true);
        } else if (message.command === WEBVIEW_COMMANDS.CLEAR_HISTORY) {
            this._chatHistoryManager.clearHistory();
        } else if (message.command === WEBVIEW_COMMANDS.GET_SESSIONS) {
            const sessions = await this._chatHistoryManager.getSessions();
            webviewView.webview.postMessage({
                type: EXTENSION_EVENTS.SESSIONS_LIST,
                sessions: sessions.map(s => ({
                    id: s.id,
                    title: s.title,
                    timestamp: s.timestamp
                }))
            });
        } else if (message.command === WEBVIEW_COMMANDS.LOAD_SESSION) {
            await this._chatHistoryManager.loadSession(message.sessionId);
            const enrichedHistory = this._toolUiProvider.enrichHistory(this._chatHistoryManager.getChatHistory());
            webviewView.webview.postMessage({
                type: EXTENSION_EVENTS.CHAT_HISTORY_LOADED,
                history: enrichedHistory
            });
        } else if (message.command === WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED) {
            this._eventBus.emit('completionProfileChanged', message.model);
            this._configProvider.updateConfig('activeCompletionProfile', message.model, true);
        } else if (message.command === WEBVIEW_COMMANDS.EDIT_API_KEY) {
            await this._secretManager.updateAPIKey(message.identifier);
            await configProcessor.updateProviders(this._configContainer.config, this._eventBus, this._secretManager, this._httpClient);
            if (this._view) {
                await this._view.pushUpdate();
            }
        } else if (message.command === WEBVIEW_COMMANDS.DELETE_API_KEY) {
            await this._secretManager.deleteSecret(message.identifier);
            await configProcessor.updateProviders(this._configContainer.config, this._eventBus, this._secretManager, this._httpClient);
            if (this._view) {
                await this._view.pushUpdate();
            }
        } else if (message.command === WEBVIEW_COMMANDS.ADD_PROFILE) {
            const currentProfiles = this._configProvider.getProfiles();
            const { id, ...profileData } = message.profile;
            currentProfiles[id] = profileData;
            await this._configProvider.updateConfig('profiles', currentProfiles, true);
        } else if (message.command === WEBVIEW_COMMANDS.DELETE_PROFILE) {
            await this._configProvider.deleteProfile(message.profileId);
        }
    }

    private async _processAgentRun() {
        let context = await this._buildContext.buildContext();
        const anonymizer = this._configContainer.config.anonymizerInstance;
        if (anonymizer) {
            context = anonymizer.anonymize(context);
        }
        const prompt = new ChatPrompt(this._chatHistoryManager.getChatHistory(), context);
        await this._chatAgent.run(prompt, this._abortController!.signal);
        this._chatHistoryManager.persistCurrentSession();
        this._eventBridge.sendCompletionMessage();
    }

    private _handleAgentError(error: any, webviewView: IWebviewView) {
        if (this._abortController?.signal.aborted) {
            this._logger.info(AGENT_LOGS.REQUEST_CANCELLED);
            this._eventBridge.sendCompletionMessage();
            return;
        }
        webviewView.webview.postMessage({
            sender: MESSAGE_SENDERS.ASSISTANT,
            type: EXTENSION_EVENTS.ERROR,
            text: CHAT_MESSAGES.ERROR_PROCESSING_REQUEST(error)
        });
    }
}
