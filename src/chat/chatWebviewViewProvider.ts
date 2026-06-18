// This module defines the `ChatWebviewViewProvider` class, which is responsible for
// creating and managing the chat interface within a VS Code webview. It acts as
// the bridge between the VS Code extension's backend logic and the webview's frontend UI.

// Importing custom types defined in `types.ts`. These types help ensure consistency
// and define the expected structure for various objects and functions used in the chat feature.
import type {
    IExtensionContextMinimal, // A minimal representation of VS Code's `ExtensionContext`,
    // providing access to essential extension resources like `extensionUri`.
    IWebviewView, // Defines the interface for a VS Code `WebviewView`, which is a container for the webview.
    WebviewMessage, // Defines the structure of messages sent from the webview to the extension.
    IChatWebviewEventBridge,
    IChatCommandHandler,
    IChatWebviewViewManager
} from '../types.js';
// Importing the `eventBus`, a custom mechanism for different parts of the extension
// to communicate by emitting and listening for events.
import { IEventBus } from '../utils/eventBus.js';

// This interface defines the arguments required to construct a `ChatWebviewViewProvider`.
// It uses dependency injection to provide all necessary components.
interface IChatWebviewViewProviderArgs {
    extensionContext: IExtensionContextMinimal; // The VS Code extension context, vital for managing extension resources.
    eventBridge: IChatWebviewEventBridge; // A bridge to forward extension events to the webview.
    commandHandler: IChatCommandHandler; // A handler for messages from the webview.
    viewManager: IChatWebviewViewManager; // A manager for the webview's UI state and content.
    eventBus: IEventBus;
}

/**
 * `ChatWebviewViewProvider` is the main class that integrates the chat UI into VS Code.
 * It implements `vscode.WebviewViewProvider` conceptually, although it's not explicitly
 * declared as such here (the `resolveWebviewView` method fulfills this role).
 *
 * It manages the lifecycle of the webview sidebar and delegates UI operations
 * to the `ChatWebviewViewManager`.
 */
export class ChatWebviewViewProvider {
    // `viewType` is a static property that defines a unique identifier for this webview view.
    // This string is used in `extension.ts` when registering this provider with VS Code:
    // `vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatProvider, ...)`.
    public static readonly viewType = 'suggestio.chat.view';

    // `_view` holds a reference to the `IWebviewView` object provided by VS Code
    // when the view is resolved. This allows the provider to interact with the webview.
    public _view?: IWebviewView;
    private readonly _extensionContext: IExtensionContextMinimal; // Stores the extension context.
    private readonly _eventBridge: IChatWebviewEventBridge; // Stores the event bridge.
    private readonly _commandHandler: IChatCommandHandler; // Stores the command handler.
    private readonly _viewManager: IChatWebviewViewManager; // Stores the view manager.
    private readonly _eventBus: IEventBus;

    /**
     * The constructor initializes the `ChatWebviewViewProvider` with its dependencies.
     * These dependencies are typically passed from `extension.ts` during activation.
     */
    constructor({ extensionContext, eventBridge, commandHandler, viewManager, eventBus }: IChatWebviewViewProviderArgs) {
        this._extensionContext = extensionContext;
        this._eventBridge = eventBridge;
        this._commandHandler = commandHandler;
        this._viewManager = viewManager;
        this._eventBus = eventBus;

        this._commandHandler.setView(this._viewManager);
        this._eventBridge.setAbortControllerAccessor(() => this._commandHandler.getAbortController());

        this._eventBus.on('configChanged', () => {
            this._viewManager.pushUpdate();
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
        this._viewManager.setView(webviewView);

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
        await this._viewManager.updateState();

        // Set up the message listener to handle communication from the webview (frontend).
        this.setupMessageHandler(this._view);
    }

    public newChat() {
        this._viewManager.newChat();
    }

    /**
     * Request the webview to open the settings overlay.
     */
    public showSettings() {
        this._viewManager.showSettings();
    }

    /**
     * Request the webview to open the history overlay.
     */
    public showHistory() {
        this._viewManager.showHistory();
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
