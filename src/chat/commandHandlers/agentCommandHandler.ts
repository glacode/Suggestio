import type {
    IChatAgent,
    IPersistentChatHistoryManager,
    IContextBuilder,
    IConfigContainer,
    IChatWebviewEventBridge,
    IWebviewView,
    ISecretManager,
    IHttpClient,
    WebviewMessage
} from '../../types.js';
import { IEventBus } from '../../utils/eventBus.js';
import { APP_EVENTS } from '../../constants/protocol.js';
import { createEventLogger } from '../../log/eventLogger.js';
import { ChatPrompt } from '../chatPrompt.js';
import { CHAT_MESSAGES, AGENT_LOGS, CONFIG_MESSAGES } from '../../constants/messages.js';
import { WEBVIEW_COMMANDS, EXTENSION_EVENTS } from '../../constants/protocol.js';
import { configProcessor } from '../../config/configProcessor.js';
import { IWebviewCommandHandler, ICommandContext } from '../chatCommandHandler.js';

/**
 * Arguments for the AgentCommandHandler constructor.
 */
export interface IAgentCommandHandlerArgs {
    chatAgent: IChatAgent;
    chatHistoryManager: IPersistentChatHistoryManager;
    buildContext: IContextBuilder;
    configContainer: IConfigContainer;
    eventBridge: IChatWebviewEventBridge;
    eventBus: IEventBus;
    secretManager: ISecretManager;
    httpClient: IHttpClient;
    setAbortController: (controller: AbortController) => void;
    getAbortController: () => AbortController | undefined;
    logger: ReturnType<typeof createEventLogger>;
}

function isSendMessage(message: WebviewMessage): message is Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.SEND_MESSAGE }> {
    return message.command === WEBVIEW_COMMANDS.SEND_MESSAGE;
}

/**
 * Handles agent-related commands: SEND_MESSAGE, RETRY_LAST_MESSAGE, CANCEL_REQUEST.
 */
export class AgentCommandHandler implements IWebviewCommandHandler {
    private readonly _chatAgent: IChatAgent;
    private readonly _chatHistoryManager: IPersistentChatHistoryManager;
    private readonly _buildContext: IContextBuilder;
    private readonly _configContainer: IConfigContainer;
    private readonly _eventBridge: IChatWebviewEventBridge;
    private readonly _eventBus: IEventBus;
    private readonly _secretManager: ISecretManager;
    private readonly _httpClient: IHttpClient;
    private readonly _setAbortController: (controller: AbortController) => void;
    private readonly _getAbortController: () => AbortController | undefined;
    private readonly _logger: ReturnType<typeof createEventLogger>;

    constructor({
        chatAgent,
        chatHistoryManager,
        buildContext,
        configContainer,
        eventBridge,
        eventBus,
        secretManager,
        httpClient,
        setAbortController,
        getAbortController,
        logger
    }: IAgentCommandHandlerArgs) {
        this._chatAgent = chatAgent;
        this._chatHistoryManager = chatHistoryManager;
        this._buildContext = buildContext;
        this._configContainer = configContainer;
        this._eventBridge = eventBridge;
        this._eventBus = eventBus;
        this._secretManager = secretManager;
        this._httpClient = httpClient;
        this._setAbortController = setAbortController;
        this._getAbortController = getAbortController;
        this._logger = logger;
    }

    canHandle(command: string): boolean {
        return command === WEBVIEW_COMMANDS.SEND_MESSAGE
            || command === WEBVIEW_COMMANDS.RETRY_LAST_MESSAGE
            || command === WEBVIEW_COMMANDS.CANCEL_REQUEST;
    }

    async handle(message: WebviewMessage, commandContext: ICommandContext): Promise<void> {
        if (isSendMessage(message)) {
            await this._handleSendMessage(message, commandContext);
        } else if (message.command === WEBVIEW_COMMANDS.RETRY_LAST_MESSAGE) {
            await this._handleRetryLastMessage(commandContext);
        } else if (message.command === WEBVIEW_COMMANDS.CANCEL_REQUEST) {
            this._handleCancelRequest();
        }
    }

    private async _handleSendMessage(message: Extract<WebviewMessage, { command: typeof WEBVIEW_COMMANDS.SEND_MESSAGE }>, commandContext: ICommandContext): Promise<void> {
        try {
            // Lazy resolution of API key if missing
            const activeProfile = this._configContainer.config.activeChatProfile;
            const profileConfig = this._configContainer.config.profiles[activeProfile];
            if (profileConfig && !profileConfig.resolvedApiKey && profileConfig.apiKeyIdentifier) {
                this._eventBus.emit(APP_EVENTS.AGENT_NOTIFICATION, {
                    text: CONFIG_MESSAGES.WAITING_FOR_API_KEY(profileConfig.apiKeyIdentifier)
                });

                await configProcessor.updateProviders(this._configContainer.config, this._eventBus, this._secretManager, this._httpClient, true);
                if (commandContext.view) {
                    await commandContext.view.pushUpdate();
                }
                this._eventBus.emit(APP_EVENTS.AGENT_NOTIFICATION, { text: null });
            }

            this._setAbortController(new AbortController());
            this._chatHistoryManager.addMessage({ role: 'user', content: message.text });
            this._chatHistoryManager.persistCurrentSession();

            await this._processAgentRun();
        } catch (error) {
            this._handleAgentError(error, commandContext.webviewView);
        }
    }

    private async _handleRetryLastMessage(commandContext: ICommandContext): Promise<void> {
        try {
            this._setAbortController(new AbortController());
            await this._processAgentRun();
        } catch (error) {
            this._handleAgentError(error, commandContext.webviewView);
        }
    }

    private _handleCancelRequest(): void {
        const abortController = this._getAbortController();
        if (abortController) {
            this._logger.info(AGENT_LOGS.CANCEL_REQUEST);
            abortController.abort();
        }
    }

    private async _processAgentRun(): Promise<void> {
        let context = await this._buildContext.buildContext();
        const anonymizer = this._configContainer.config.anonymizerInstance;
        if (anonymizer) {
            context = anonymizer.anonymize(context);
        }
        const prompt = new ChatPrompt(this._chatHistoryManager.getChatHistory(), context);
        const abortController = this._getAbortController();
        await this._chatAgent.run(prompt, abortController!.signal);
        this._chatHistoryManager.persistCurrentSession();
        this._eventBridge.sendCompletionMessage();
    }

    private _handleAgentError(error: any, webviewView: IWebviewView): void {
        const abortController = this._getAbortController();
        if (abortController?.signal.aborted) {
            this._logger.info(AGENT_LOGS.REQUEST_CANCELLED);
            this._eventBridge.sendCompletionMessage();
            return;
        }
        webviewView.webview.postMessage({
            sender: 'assistant',
            type: EXTENSION_EVENTS.ERROR,
            text: CHAT_MESSAGES.ERROR_PROCESSING_REQUEST(error)
        });
    }
}