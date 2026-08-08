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
    IVscodeApiLocal,
    IEventBus,
    ISecretManager
} from '../types.js';
import { createEventLogger } from '../log/eventLogger.js';
import { ChatCommandHandler, IWebviewCommandHandler } from './chatCommandHandler.js';
import { AgentCommandHandler } from './commands/agentCommandHandler.js';

/**
 * Dependencies required to build the command handler chain.
 * Centralizes all dependencies needed by any command handler.
 */
export interface IChatCommandHandlerDependencies {
    chatAgent: IChatAgent;
    chatHistoryManager: IPersistentChatHistoryManager;
    buildContext: IContextBuilder;
    eventBus: IEventBus;
    diffManager: IDiffManager;
    configContainer: IConfigContainer;
    configProvider: IConfigProvider;
    secretManager: ISecretManager;
    httpClient: IHttpClient;
    toolUiProvider: IToolUiProvider;
    eventBridge: IChatWebviewEventBridge;
    vscodeApi: IVscodeApiLocal;
}

/**
 * Creates the full chain of webview command handlers.
 *
 * This factory function is the single composition point for all specialized
 * command handlers. It wires up dependencies and injects them into the
 * ChatCommandHandler, which acts as a dispatcher.
 *
 * Future handlers (ProfileCommandHandler, HistoryCommandHandler, etc.) should be
 * constructed and added to the handlers array here.
 *
 * @param deps All dependencies needed by any command handler
 * @returns A configured ChatCommandHandler ready to dispatch webview messages
 */
export function createChatCommandHandler(deps: IChatCommandHandlerDependencies): ChatCommandHandler {
    const logger = createEventLogger(deps.eventBus);

    // Shared abort controller state across handlers that need it
    let abortController: AbortController | undefined;
    const setAbortController = (ac: AbortController) => { abortController = ac; };
    const getAbortController = () => abortController;

    // Construct specialized handlers
    const agentHandler = new AgentCommandHandler({
        chatAgent: deps.chatAgent,
        chatHistoryManager: deps.chatHistoryManager,
        buildContext: deps.buildContext,
        configContainer: deps.configContainer,
        eventBridge: deps.eventBridge,
        eventBus: deps.eventBus,
        secretManager: deps.secretManager,
        httpClient: deps.httpClient,
        setAbortController,
        getAbortController,
        logger
    });

    const handlers: IWebviewCommandHandler[] = [agentHandler];

    // Future handlers will be constructed and added here:
    // const profileHandler = new ProfileCommandHandler({...});
    // handlers.push(profileHandler);

    return new ChatCommandHandler({
        handlers,
        chatHistoryManager: deps.chatHistoryManager,
        eventBus: deps.eventBus,
        diffManager: deps.diffManager,
        configContainer: deps.configContainer,
        configProvider: deps.configProvider,
        secretManager: deps.secretManager,
        httpClient: deps.httpClient,
        toolUiProvider: deps.toolUiProvider,
        eventBridge: deps.eventBridge,
        vscodeApi: deps.vscodeApi,
        getAbortController
    });
}
