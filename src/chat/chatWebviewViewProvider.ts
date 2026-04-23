// This module defines the `ChatWebviewViewProvider` class, which is responsible for
// creating and managing the chat interface within a VS Code webview. It acts as
// the bridge between the VS Code extension's backend logic and the webview's frontend UI.

// Importing custom types defined in `types.ts`. These types help ensure consistency
// and define the expected structure for various objects and functions used in the chat feature.
import type {
    IChatAgent, // Defines the interface for handling chat logic (e.g., sending prompts to an LLM).
    IChatHistoryManager, // Defines the interface for managing chat history (e.g., clearing it).
    GetChatWebviewContent, // A function type for generating the HTML content for the webview.
    ILlmProviderAccessor, // Defines the interface for accessing information about LLM providers (models).
    IExtensionContextMinimal, // A minimal representation of VS Code's `ExtensionContext`,
    // providing access to essential extension resources like `extensionUri`.
    IVscodeApiLocal, // A minimal, faked representation of the VS Code API, used primarily for URI handling.
    IFileContentReader, // Defines the interface for reading file contents.
    IWebviewView, // Defines the interface for a VS Code `WebviewView`, which is a container for the webview.
    WebviewMessage, // Defines the structure of messages sent from the webview to the extension.
    IContextBuilder, // Defines the interface for building context strings to be used as additional information in prompts.
    IAnonymizer,
    ITokenEventPayload,
    IToolCallEventPayload,
    IToolOutputEventPayload,
    IToolResultEventPayload,
    IToolConfirmationPayload,
    IDiffManager,
    IConfig,
    IHttpClient
} from '../types.js';
// Importing the `eventBus`, a custom mechanism for different parts of the extension
// to communicate by emitting and listening for events.
import { IEventBus } from '../utils/eventBus.js';
import { createEventLogger } from '../log/eventLogger.js';
import { ChatPrompt } from './chatPrompt.js';
import { CHAT_MESSAGES, AGENT_LOGS } from '../constants/messages.js';
import { WEBVIEW_COMMANDS, EXTENSION_EVENTS, EXTENSION_COMMANDS, MESSAGE_SENDERS } from '../constants/protocol.js';
import { configProcessor, ISecretManager } from '../config/configProcessor.js';

// This interface defines the arguments required to construct a `ChatWebviewViewProvider`.
// It uses dependency injection to provide all necessary components.
interface IChatWebviewViewProviderArgs {
    extensionContext: IExtensionContextMinimal; // The VS Code extension context, vital for managing extension resources.
    profileAccessor: ILlmProviderAccessor; // An accessor to retrieve available and active LLM profiles.
    chatAgent: IChatAgent; // The agent responsible for interacting with the LLM.
    chatHistoryManager: IChatHistoryManager; // The manager responsible for chat history operations.
    buildContext: IContextBuilder; // A builder to create contextual information for the AI prompt.
    getChatWebviewContent: GetChatWebviewContent; // A function that provides the HTML content for the webview.
    vscodeApi: IVscodeApiLocal; // The VS Code API instance, used here for `Uri` operations.
    fileReader: IFileContentReader;
    eventBus: IEventBus;
    diffManager: IDiffManager;
    anonymizer?: IAnonymizer;
    config: IConfig;
    secretManager: ISecretManager;
    httpClient: IHttpClient;
}

/**
 * `ChatWebviewViewProvider` is the main class that integrates the chat UI into VS Code.
 * It implements `vscode.WebviewViewProvider` conceptually, although it's not explicitly
 * declared as such here (the `resolveWebviewView` method fulfills this role).
 *
 * It manages the lifecycle of the webview, sets its content, and handles messages
 * exchanged between the webview (frontend) and the extension (backend).
 */
export class ChatWebviewViewProvider {
    // `viewType` is a static property that defines a unique identifier for this webview view.
    // This string is used in `extension.ts` when registering this provider with VS Code:
    // `vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatProvider, ...)`.
    public static readonly viewType = 'suggestio.chat.view';

    // `_view` holds a reference to the `IWebviewView` object provided by VS Code
    // when the view is resolved. This allows the provider to interact with the webview.
    public _view?: IWebviewView;
    private readonly _chatAgent: IChatAgent; // Stores the handler for chat backend logic.
    private readonly _chatHistoryManager: IChatHistoryManager; // Stores the chat history manager.
    private readonly _buildContext: IContextBuilder; // Stores the context builder instance.
    private readonly _extensionContext: IExtensionContextMinimal; // Stores the extension context.
    private readonly _profileAccessor: ILlmProviderAccessor; // Stores the profile accessor.
    private readonly _getChatWebviewContent: GetChatWebviewContent; // Stores the webview content generator.
    private readonly _vscodeApi: IVscodeApiLocal; // Stores the VS Code API for internal use.
    private readonly _fileReader: IFileContentReader;
    private readonly _eventBus: IEventBus;
    private readonly _diffManager: IDiffManager;
    private readonly _anonymizer?: IAnonymizer;
    private readonly _config: IConfig;
    private readonly _secretManager: ISecretManager;
    private readonly _httpClient: IHttpClient;
    private _abortController?: AbortController; // For cancelling ongoing LLM requests
    
    // Store active diff data keyed by toolCallId to handle 'viewDiff' commands
    private _activeDiffs = new Map<string, IToolConfirmationPayload['diffData']>();

    private logger: ReturnType<typeof createEventLogger>;

    /**
     * The constructor initializes the `ChatWebviewViewProvider` with its dependencies.
     * These dependencies are typically passed from `extension.ts` during activation.
     */
    constructor({ extensionContext, profileAccessor, chatAgent, chatHistoryManager, buildContext, getChatWebviewContent, vscodeApi, fileReader, eventBus, diffManager, anonymizer, config, secretManager, httpClient }: IChatWebviewViewProviderArgs) {
        this._extensionContext = extensionContext;
        this._profileAccessor = profileAccessor;
        this._chatAgent = chatAgent;
        this._chatHistoryManager = chatHistoryManager;
        this._buildContext = buildContext;
        this._getChatWebviewContent = getChatWebviewContent;
        this._vscodeApi = vscodeApi;
        this._fileReader = fileReader;
        this._eventBus = eventBus;
        this._diffManager = diffManager;
        this._anonymizer = anonymizer;
        this._config = config;
        this._secretManager = secretManager;
        this._httpClient = httpClient;
        this.logger = createEventLogger(eventBus);

        this._eventBus.on('agent:maxIterationsReached', (payload: { maxIterations: number }) => {
            this.logger.info(AGENT_LOGS.MAX_ITERATIONS_REACHED(payload.maxIterations));
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.ERROR,
                    text: CHAT_MESSAGES.MAX_ITERATIONS_REACHED(payload.maxIterations)
                });
            }
        });

        this._eventBus.on('agent:token', (payload: ITokenEventPayload) => {
            if (this._abortController?.signal.aborted) {
                return;
            }
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOKENS,
                    text: payload.token,
                    tokenType: payload.type
                });
            }
        });

        this._eventBus.on('agent:toolStart', (payload: IToolCallEventPayload) => {
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOOL_START,
                    toolCallId: payload.toolCallId,
                    toolName: payload.toolName,
                    displayMessage: payload.displayMessage,
                    args: payload.args
                });
            }
        });

        this._eventBus.on('agent:toolOutput', (payload: IToolOutputEventPayload) => {
            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOOL_OUTPUT,
                    toolCallId: payload.toolCallId,
                    output: payload.output
                });
            }
        });

        this._eventBus.on('agent:toolEnd', (payload: IToolResultEventPayload) => {
            // Clean up diff data when tool finishes
            this._activeDiffs.delete(payload.toolCallId);

            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.TOOL_END,
                    toolCallId: payload.toolCallId,
                    toolName: payload.toolName,
                    result: payload.result,
                    success: payload.success
                });
            }
        });

        this._eventBus.on('agent:notification', (payload: { text: string | null }) => {
            this._sendNotification(payload.text);
        });

        this._eventBus.on('agent:requestConfirmation', (payload: IToolConfirmationPayload) => {
            // Store diff data if present
            if (payload.diffData) {
                this._activeDiffs.set(payload.toolCallId, payload.diffData);
            }

            if (this._view) {
                this._view.webview.postMessage({
                    sender: MESSAGE_SENDERS.ASSISTANT,
                    type: EXTENSION_EVENTS.REQUEST_CONFIRMATION,
                    toolCallId: payload.toolCallId,
                    toolName: payload.toolName,
                    message: payload.message,
                    diffData: payload.diffData
                });
            }
        });
    }

    /**
     * `resolveWebviewView` is a core method of the `vscode.WebviewViewProvider` interface.
     * VS Code calls this method when a webview view is first displayed or restored.
     * This is where the webview's properties are configured and its content is set.
     *
     * @param webviewView The `IWebviewView` object representing the VS Code chat sidebar panel.
     */
    public async resolveWebviewView(webviewView: IWebviewView) {
        this._view = webviewView; // Store the provided webviewView for later access.

        // Sets the title of the webview sidebar panel. By setting it to an empty string,
        // VS Code will typically use the extension's name ("SUGGESTIO") as the title.
        webviewView.title = "";

        // Configure the webview's options, which control its behavior and capabilities.
        // This corresponds to `vscode.WebviewOptions`.
        this._view.webview.options = {
            enableScripts: true, // Allows JavaScript to run inside the webview, enabling interactivity.
            localResourceRoots: [this._extensionContext.extensionUri] // Specifies URIs from which the webview can load local resources
            // (like scripts, stylesheets). Here, it's restricted to the
            // extension's own directory for security.
        };

        // Initial state population and HTML setting
        await this._updateWebviewState();

        // Set up the message listener to handle communication from the webview (frontend).
        this.setupMessageHandler(this._view);
    }

    private async _updateWebviewState() {
        if (!this._view) {
            return;
        }

        // Construct URIs for assets
        const chatJsUri = this._view.webview.asWebviewUri(
            this._vscodeApi.Uri.joinPath(this._extensionContext.extensionUri, 'builtResources', 'chat.js')
        );
        const markdownJsUri = this._view.webview.asWebviewUri(
            this._vscodeApi.Uri.joinPath(this._extensionContext.extensionUri, 'builtResources', 'renderMarkDown.js')
        );
        const highlightCssUri = this._view.webview.asWebviewUri(
            this._vscodeApi.Uri.joinPath(this._extensionContext.extensionUri, 'media', 'highlight.css')
        );
        const chatCssUri = this._view.webview.asWebviewUri(
            this._vscodeApi.Uri.joinPath(this._extensionContext.extensionUri, 'media', 'chat.css')
        );

        // Retrieve the list of available profiles and the currently active profile from the accessor.
        const profiles = this._profileAccessor.getProfiles();
        const activeProfile = this._profileAccessor.getActiveProfile();
        // completionProfiles should include all models (not only tool-enabled).
        const completionProfiles = typeof this._profileAccessor.getCompletionProfiles === 'function'
            ? this._profileAccessor.getCompletionProfiles()!
            : profiles;
        const activeCompletionProfile = typeof this._profileAccessor.getCompletionActiveProfile === 'function'
            ? this._profileAccessor.getCompletionActiveProfile!()
            : (this._config.activeCompletionProfile || activeProfile);

        // Generate the full HTML content for the webview using the `_getChatWebviewContent` function.
        this._view.webview.html = this._getChatWebviewContent({
            extensionUri: this._extensionContext.extensionUri,
            chatJsUri,
            markdownJsUri,
            highlightCssUri,
            chatCssUri,
            initialState: {
                profiles,
                activeProfile,
                completionProfiles: completionProfiles,
                activeCompletionProfile: activeCompletionProfile,
                profileMetadata: await this._getProfileMetadata(completionProfiles, activeProfile, activeCompletionProfile)
            },
            vscodeApi: this._vscodeApi,
            fileReader: this._fileReader
        });
    }

    private async _getProfileMetadata(completionProfiles: string[], activeProfile: string, activeCompletionProfile: string) {
        return await Promise.all(completionProfiles.map(async (id) => {
            const profile = this._config.profiles[id];
            const apiKeyValue = profile?.apiKey;
            const match = typeof apiKeyValue === "string" ? apiKeyValue.match(/^\$\{(\w+)\}$/) : null;
            const placeholder = match ? match[1] : undefined;
            const hasApiKey = placeholder ? !!(await this._secretManager.getSecret(placeholder)) : false;

            return {
                id,
                model: profile?.model || '',
                needsApiKey: !!placeholder,
                hasApiKey,
                apiKeyPlaceholder: placeholder,
                isActiveChat: id === activeProfile,
                isActiveCompletion: id === activeCompletionProfile
            };
        }));
    }


    public newChat() {
        this._chatHistoryManager.clearHistory();
        if (this._view) {
            this._view.webview.postMessage({ command: EXTENSION_COMMANDS.NEW_CHAT });
        }
    }

    /**
     * Request the webview to open the settings overlay.
     */
    public showSettings() {
        if (this._view) {
            this._view.webview.postMessage({ command: EXTENSION_COMMANDS.OPEN_SETTINGS });
        }
    }

    private _sendNotification(text: string | null) {
        if (this._view) {
            this._view.webview.postMessage({
                sender: MESSAGE_SENDERS.ASSISTANT,
                type: EXTENSION_EVENTS.NOTIFICATION,
                text
            });
        }
    }

    private _sendCompletionMessage() {
        if (this._view) {
            this._view.webview.postMessage({
                sender: MESSAGE_SENDERS.ASSISTANT,
                type: EXTENSION_EVENTS.COMPLETION,
                text: ''
            });
        }
    }

    private async _processAgentRun() {
        let context = await this._buildContext.buildContext();
        if (this._anonymizer) {
            context = this._anonymizer.anonymize(context);
        }
        const prompt = new ChatPrompt(this._chatHistoryManager.getChatHistory(), context);
        
        // Call the agent to run the logic loop.
        await this._chatAgent.run(prompt, this._abortController!.signal);

        // Always send completion to reset UI state
        this._sendCompletionMessage();
    }

    private _handleAgentError(error: any, webviewView: IWebviewView) {
        // If request was cancelled, don't show error
        if (this._abortController?.signal.aborted) {
            this.logger.info(AGENT_LOGS.REQUEST_CANCELLED);
            this._sendCompletionMessage();
            return;
        }
        
        // If an error occurs during the chat response, post an error message back to the webview.
        webviewView.webview.postMessage({
            sender: MESSAGE_SENDERS.ASSISTANT,
            type: EXTENSION_EVENTS.ERROR,
            text: CHAT_MESSAGES.ERROR_PROCESSING_REQUEST(error)
        });
    }

    /**
     * `setupMessageHandler` configures the listener for messages sent *from* the webview.
     * This is the primary way the webview (e.g., user input, model selection) communicates
     * back to the VS Code extension.
     *
     * @param webviewView The `IWebviewView` containing the webview to set up listeners for.
     */
    private setupMessageHandler(webviewView: IWebviewView) {
        // Registers an event listener on the extension side that fires when the webview sends a message.
        // `vscode.Webview.onDidReceiveMessage` is the core mechanism for the webview UI to communicate
        // back to the extension's backend logic.
        webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
            // The `command` property of the message determines the action to take.
            if (message.command === WEBVIEW_COMMANDS.SEND_MESSAGE) {
                // Handle a message sent by the user from the webview to initiate a chat response.
                try {
                    // Lazy resolution of API key if missing
                    const activeProfile = this._config.activeChatProfile;
                    const profileConfig = this._config.profiles[activeProfile];
                    if (profileConfig && !profileConfig.resolvedApiKey && profileConfig.apiKeyPlaceholder) {
                        // Show notification that we need API key
                        this._eventBus.emit('agent:notification', {
                            text: `Waiting for API key "${profileConfig.apiKeyPlaceholder}" to be entered...`
                        });

                        // Prompt user for API key (with forcePrompt=true)
                        await configProcessor.updateProviders(this._config, this._eventBus, this._secretManager, this._httpClient, true);

                        // Hide notification after key is resolved
                        this._eventBus.emit('agent:notification', { text: null });
                    }

                    // Create a new AbortController for this request
                    this._abortController = new AbortController();

                    this._chatHistoryManager.addMessage({ role: 'user', content: message.text });
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
                // Handle cancel request from webview
                if (this._abortController) {
                    this.logger.info(AGENT_LOGS.CANCEL_REQUEST);
                    this._abortController.abort();
                }
            } else if (message.command === WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL) {
                if (message.decision === 'deny') {
                    const diffData = this._activeDiffs.get(message.toolCallId);
                    if (diffData) {
                        await this._diffManager.closeDiff(diffData.filePath);
                    }
                }
                this._eventBus.emit('user:confirmationResponse', {
                    toolCallId: message.toolCallId,
                    decision: message.decision
                });
            } else if (message.command === WEBVIEW_COMMANDS.VIEW_DIFF) {
                const diffData = this._activeDiffs.get(message.toolCallId);
                if (diffData) {
                    await this._diffManager.showDiff(diffData.filePath, diffData.oldContent, diffData.newContent);
                }
            } else if (message.command === WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED) {
                // Handle a message indicating that the active profile has changed in the webview.
                // Emit a 'chatProfileChanged' event on the global event bus, allowing other parts
                // of the extension to react to this change.
                this._eventBus.emit('chatProfileChanged', message.model);
            } else if (message.command === WEBVIEW_COMMANDS.CLEAR_HISTORY) {
                // Handle a message requesting to clear the chat history.
                // Call the `clearHistory` method on the `chatHistoryManager`.
                this._chatHistoryManager.clearHistory();
            } else if (message.command === WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED) {
                // Handle a message from the webview indicating the user changed the
                // completion profile in the settings overlay. Emit the existing
                // 'completionProfileChanged' event so configProcessor picks it up.
                this._eventBus.emit('completionProfileChanged', message.model);

                // Trigger live update of the settings overlay
                const completionProfiles = typeof this._profileAccessor.getCompletionProfiles === 'function' ? this._profileAccessor.getCompletionProfiles()! : this._profileAccessor.getProfiles();
                const metadata = await this._getProfileMetadata(completionProfiles, this._profileAccessor.getActiveProfile(), message.model);
                this._view?.webview.postMessage({ type: EXTENSION_EVENTS.UPDATE_PROFILE_METADATA, metadata });
            } else if (message.command === WEBVIEW_COMMANDS.EDIT_API_KEY) {
                await this._secretManager.updateAPIKey(message.placeholder);
                // Refresh background provider instances with new key
                await configProcessor.updateProviders(this._config, this._eventBus, this._secretManager, this._httpClient);
                // Send updated metadata to the webview to refresh the overlay
                const completionProfiles = typeof this._profileAccessor.getCompletionProfiles === 'function' ? this._profileAccessor.getCompletionProfiles()! : this._profileAccessor.getProfiles();
                const updatedMetadata = await this._getProfileMetadata(completionProfiles, this._profileAccessor.getActiveProfile(), this._profileAccessor.getCompletionActiveProfile?.() || this._config.activeCompletionProfile || this._profileAccessor.getActiveProfile());
                this._view?.webview.postMessage({
                    type: EXTENSION_EVENTS.UPDATE_PROFILE_METADATA,
                    metadata: updatedMetadata
                });
            } else if (message.command === WEBVIEW_COMMANDS.DELETE_API_KEY) {
                await this._secretManager.deleteSecret(message.placeholder);
                // Refresh background provider instances
                await configProcessor.updateProviders(this._config, this._eventBus, this._secretManager, this._httpClient);
                // Send updated metadata to the webview to refresh the overlay
                const completionProfiles = typeof this._profileAccessor.getCompletionProfiles === 'function' ? this._profileAccessor.getCompletionProfiles()! : this._profileAccessor.getProfiles();
                const updatedMetadata = await this._getProfileMetadata(completionProfiles, this._profileAccessor.getActiveProfile(), this._profileAccessor.getCompletionActiveProfile?.() || this._config.activeCompletionProfile || this._profileAccessor.getActiveProfile());
                this._view?.webview.postMessage({
                    type: EXTENSION_EVENTS.UPDATE_PROFILE_METADATA,
                    metadata: updatedMetadata
                });
            }
        });
    }
}
