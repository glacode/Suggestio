// This module defines the `ChatWebviewViewProvider` class, which is responsible for
// creating and managing the chat interface within a VS Code webview. It acts as
// the bridge between the VS Code extension's backend logic and the webview's frontend UI.

// Importing custom types defined in `types.ts`. These types help ensure consistency
// and define the expected structure for various objects and functions used in the chat feature.
import type {
    IPersistentChatHistoryManager, // Defines the interface for managing persistent chat history.
    GetChatWebviewContent, // A function type for generating the HTML content for the webview.
    IExtensionContextMinimal, // A minimal representation of VS Code's `ExtensionContext`,
    // providing access to essential extension resources like `extensionUri`.
    IVscodeApiLocal, // A minimal, faked representation of the VS Code API, used primarily for URI handling.
    IFileContentReader, // Defines the interface for reading file contents.
    IWebviewView, // Defines the interface for a VS Code `WebviewView`, which is a container for the webview.
    WebviewMessage, // Defines the structure of messages sent from the webview to the extension.
    IConfigContainer,
    IProfileMetadataProvider,
    IChatWebviewEventBridge,
    IChatWebviewView,
    IChatCommandHandler
} from '../types.js';
// Importing the `eventBus`, a custom mechanism for different parts of the extension
// to communicate by emitting and listening for events.
import { IEventBus } from '../utils/eventBus.js';
import { EXTENSION_EVENTS, EXTENSION_COMMANDS } from '../constants/protocol.js';
import { getNonce } from '../utils/textUtils.js';

// This interface defines the arguments required to construct a `ChatWebviewViewProvider`.
// It uses dependency injection to provide all necessary components.
interface IChatWebviewViewProviderArgs {
    extensionContext: IExtensionContextMinimal; // The VS Code extension context, vital for managing extension resources.
    profileMetadataProvider: IProfileMetadataProvider; // A provider to retrieve and sort LLM profile metadata.
    eventBridge: IChatWebviewEventBridge; // A bridge to forward extension events to the webview.
    commandHandler: IChatCommandHandler; // A handler for messages from the webview.
    chatHistoryManager: IPersistentChatHistoryManager; // The manager responsible for persistent chat history operations.
    getChatWebviewContent: GetChatWebviewContent; // A function that provides the HTML content for the webview.
    vscodeApi: IVscodeApiLocal; // The VS Code API instance, used here for `Uri` operations.
    fileReader: IFileContentReader;
    eventBus: IEventBus;
    configContainer: IConfigContainer;
}

/**
 * `ChatWebviewViewProvider` is the main class that integrates the chat UI into VS Code.
 * It implements `vscode.WebviewViewProvider` conceptually, although it's not explicitly
 * declared as such here (the `resolveWebviewView` method fulfills this role).
 *
 * It manages the lifecycle of the webview, sets its content, and handles messages
 * exchanged between the webview (frontend) and the extension (backend).
 */
export class ChatWebviewViewProvider implements IChatWebviewView {
    // `viewType` is a static property that defines a unique identifier for this webview view.
    // This string is used in `extension.ts` when registering this provider with VS Code:
    // `vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatProvider, ...)`.
    public static readonly viewType = 'suggestio.chat.view';

    // `_view` holds a reference to the `IWebviewView` object provided by VS Code
    // when the view is resolved. This allows the provider to interact with the webview.
    public _view?: IWebviewView;
    private readonly _chatHistoryManager: IPersistentChatHistoryManager; // Stores the chat history manager.
    private readonly _extensionContext: IExtensionContextMinimal; // Stores the extension context.
    private readonly _profileMetadataProvider: IProfileMetadataProvider; // Stores the profile metadata provider.
    private readonly _eventBridge: IChatWebviewEventBridge; // Stores the event bridge.
    private readonly _commandHandler: IChatCommandHandler; // Stores the command handler.
    private readonly _getChatWebviewContent: GetChatWebviewContent; // Stores the webview content generator.
    private readonly _vscodeApi: IVscodeApiLocal; // Stores the VS Code API for internal use.
    private readonly _fileReader: IFileContentReader;
    private readonly _eventBus: IEventBus;
    private readonly _configContainer: IConfigContainer;

    /**
     * The constructor initializes the `ChatWebviewViewProvider` with its dependencies.
     * These dependencies are typically passed from `extension.ts` during activation.
     */
    constructor({ extensionContext, profileMetadataProvider, eventBridge, commandHandler, chatHistoryManager, getChatWebviewContent, vscodeApi, fileReader, eventBus, configContainer }: IChatWebviewViewProviderArgs) {
        this._extensionContext = extensionContext;
        this._profileMetadataProvider = profileMetadataProvider;
        this._eventBridge = eventBridge;
        this._commandHandler = commandHandler;
        this._chatHistoryManager = chatHistoryManager;
        this._getChatWebviewContent = getChatWebviewContent;
        this._vscodeApi = vscodeApi;
        this._fileReader = fileReader;
        this._eventBus = eventBus;
        this._configContainer = configContainer;

        this._commandHandler.setView(this);
        this._eventBridge.setAbortControllerAccessor(() => this._commandHandler.getAbortController());

        this._eventBus.on('configChanged', () => {
            this.pushUpdate();
        });
    }

    /**
     * `resolveWebviewView` is a core method of the `vscode.WebviewViewProvider` interface.
     * VS Code calls this method when a webview view is first displayed or restored.
     * This is where the webview's properties are configured and its content is set.
     *
     * @param webviewView The `IWebviewView` object representing the VS Code chat sidebar panel.
     */
    public async resolveWebviewView(
        webviewView: IWebviewView
    ) {
        this._view = webviewView; // Store the provided webviewView for later access.
        this._eventBridge.setView(webviewView);

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
        await this.updateState();

        // Set up the message listener to handle communication from the webview (frontend).
        this.setupMessageHandler(this._view);
    }

    public async updateState() {
        if (!this._view) {
            return;
        }

        const { chatJsUri, markdownJsUri, highlightCssUri, chatCssUri } = this._getAssetUris();

        const { chatProfileIds, activeChatProfileId, allProfileIds, activeCompletionProfileId, profileMetadata } = await this._profileMetadataProvider.getStateData();
        const nonce = getNonce();

        // Generate the full HTML content for the webview using the `_getChatWebviewContent` function.
        this._view.webview.html = this._getChatWebviewContent({
            extensionUri: this._extensionContext.extensionUri,
            chatJsUri,
            markdownJsUri,
            highlightCssUri,
            chatCssUri,
            initialState: {
                chatProfileIds,
                activeChatProfileId,
                allProfileIds,
                activeCompletionProfileId,
                profileMetadata,
                disableSanitizer: this._configContainer.config.disableSanitizer
            },
            vscodeApi: this._vscodeApi,
            fileReader: this._fileReader,
            nonce,
            cspSource: this._view.webview.cspSource
        });
    }

    private _getAssetUris() {
        if (!this._view) {
            throw new Error('View is not initialized');
        }
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
        return { chatJsUri, markdownJsUri, highlightCssUri, chatCssUri };
    }

    public async pushUpdate() {
        if (!this._view) {
            return;
        }

        const { chatProfileIds, activeChatProfileId, profileMetadata } = await this._profileMetadataProvider.getStateData();

        this._view.webview.postMessage({
            type: EXTENSION_EVENTS.UPDATE_PROFILE_METADATA,
            metadata: profileMetadata,
            profiles: chatProfileIds,
            activeProfile: activeChatProfileId
        });
    }

    public newChat() {
        this._chatHistoryManager.newSession();
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

    /**
     * Request the webview to open the history overlay.
     */
    public showHistory() {
        if (this._view) {
            this._view.webview.postMessage({ command: EXTENSION_COMMANDS.OPEN_HISTORY });
        }
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
            await this._commandHandler.handleMessage(message, webviewView);
        });
    }
}
