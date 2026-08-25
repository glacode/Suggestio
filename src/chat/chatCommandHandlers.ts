import type {
    IChatAgent,
    IPersistentChatHistoryManager,
    IPromptContextBuilder,
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
import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import { ChatCommandHandler, IWebviewCommandHandler } from './chatCommandHandler.js';
import { AgentCommandHandler } from './commandHandlers/agentCommandHandler.js';
import { ProfileCommandHandler } from './commandHandlers/profileCommandHandler.js';
import { HistoryCommandHandler } from './commandHandlers/historyCommandHandler.js';
import { ToolCommandHandler } from './commandHandlers/toolCommandHandler.js';
import { CompletionCommandHandler } from './commandHandlers/completionCommandHandler.js';

/**
 * Dependencies required to build the command handler chain.
 * Centralizes all dependencies needed by any command handler.
 */
export interface IChatCommandHandlerDependencies {
    chatAgent: IChatAgent;
    chatHistoryManager: IPersistentChatHistoryManager;
    buildContext: IPromptContextBuilder;
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

    const profileHandler = new ProfileCommandHandler({
        configProvider: deps.configProvider,
        secretManager: deps.secretManager,
        httpClient: deps.httpClient,
        configContainer: deps.configContainer,
        eventBus: deps.eventBus
    });

    const historyHandler = new HistoryCommandHandler({
        chatHistoryManager: deps.chatHistoryManager,
        toolUiProvider: deps.toolUiProvider
    });

    const toolHandler = new ToolCommandHandler({
        diffManager: deps.diffManager,
        eventBridge: deps.eventBridge,
        vscodeApi: deps.vscodeApi,
        eventBus: deps.eventBus
    });

    const completionHandler = new CompletionCommandHandler({
        configProvider: deps.configProvider,
        eventBus: deps.eventBus
    });

    const handlers: IWebviewCommandHandler[] = [agentHandler, profileHandler, historyHandler, toolHandler, completionHandler];

    // Future handlers will be constructed and added here:
    // const profileHandler = new ProfileCommandHandler({...});
    // handlers.push(profileHandler);

    // Fail fast at composition time if the assembled handlers don't cover
    // every command in the WEBVIEW_COMMANDS protocol. This catches the
    // silent-drop failure mode where handleMessage() would otherwise exit
    // its for-loop without dispatching anything for an unknown command.
    _validateCommandCoverage(handlers);

    return new ChatCommandHandler({
        handlers,
        eventBus: deps.eventBus,
        getAbortController
    });
}

/**
 * Verifies that the supplied handlers collectively cover every command in
 * the WEBVIEW_COMMANDS protocol. Throws an Error listing the missing
 * commands if coverage is incomplete.
 *
 * This is the composition-root's responsibility: it is the only place that
 * knows the full set of handlers, and therefore the only place that can
 * make a statement about the protocol as a whole.
 */
function _validateCommandCoverage(handlers: IWebviewCommandHandler[]): void {
    const allCommands = Object.values(WEBVIEW_COMMANDS);
    const coveredCommands = new Set<string>();

    for (const handler of handlers) {
        for (const command of allCommands) {
            if (handler.canHandle(command)) {
                coveredCommands.add(command);
            }
        }
    }

    const uncoveredCommands = allCommands.filter(command => !coveredCommands.has(command));

    if (uncoveredCommands.length > 0) {
        throw new Error(
            `createChatCommandHandler: commands not covered by any handler: ${uncoveredCommands.join(', ')}`
        );
    }
}
