// This module defines the `ChatWebviewViewProvider` class, which is responsible for
// creating and managing the chat interface within a VS Code webview. It acts as
// the bridge between the VS Code extension's backend logic and the webview's frontend UI.

// Importing custom types defined in `types.ts`. These types help ensure consistency
// and define the expected structure for various objects and functions used in the chat feature.
import type {
    IChatResponder, // Defines the interface for handling chat logic (e.g., sending prompts to an LLM).
    BuildContext, // A function type for generating additional context for prompts.
    GetChatWebviewContent, // A function type for generating the HTML content for the webview.
    ILlmProviderAccessor, // Defines the interface for accessing information about LLM providers (models).
    IExtensionContextMinimal, // A minimal representation of VS Code's `ExtensionContext`,
                               // providing access to essential extension resources like `extensionUri`.
    IVscodeApiLocal, // A minimal, faked representation of the VS Code API, used primarily for URI handling.
    IWebviewView, // Defines the interface for a VS Code `WebviewView`, which is a container for the webview.
    WebviewMessage // Defines the structure of messages sent from the webview to the extension.
} from './types.js';
// Importing the `eventBus`, a custom mechanism for different parts of the extension
// to communicate by emitting and listening for events.
import { eventBus } from '../events/eventBus.js';

// This interface defines the arguments required to construct a `ChatWebviewViewProvider`.
// It uses dependency injection to provide all necessary components.
interface IChatWebviewViewProviderArgs {
    extensionContext: IExtensionContextMinimal; // The VS Code extension context, vital for managing extension resources.
    providerAccessor: ILlmProviderAccessor; // An accessor to retrieve available and active LLM models.
    logicHandler: IChatResponder; // The core logic handler responsible for interacting with the LLM.
    buildContext: BuildContext; // A function to create contextual information for the AI prompt.
    getChatWebviewContent: GetChatWebviewContent; // A function that provides the HTML content for the webview.
    vscodeApi: IVscodeApiLocal; // The VS Code API instance, used here for `Uri` operations.
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
    private readonly _logicHandler: IChatResponder; // Stores the handler for chat backend logic.
    private readonly _buildContext: BuildContext; // Stores the context builder function.
    private readonly _context: IExtensionContextMinimal; // Stores the extension context.
    private readonly _providerAccessor: ILlmProviderAccessor; // Stores the model provider accessor.
    private readonly _getChatWebviewContent: GetChatWebviewContent; // Stores the webview content generator.
    private readonly _vscodeApi: IVscodeApiLocal; // Stores the VS Code API for internal use.

    /**
     * The constructor initializes the `ChatWebviewViewProvider` with its dependencies.
     * These dependencies are typically passed from `extension.ts` during activation.
     */
    constructor({ extensionContext, providerAccessor, logicHandler, buildContext, getChatWebviewContent, vscodeApi }: IChatWebviewViewProviderArgs) {
        this._context = extensionContext;
        this._providerAccessor = providerAccessor;
        this._logicHandler = logicHandler;
        this._buildContext = buildContext;
        this._getChatWebviewContent = getChatWebviewContent;
        this._vscodeApi = vscodeApi;
    }

    /**
     * `resolveWebviewView` is a core method of the `vscode.WebviewViewProvider` interface.
     * VS Code calls this method when a webview view is first displayed or restored.
     * This is where the webview's properties are configured and its content is set.
     *
     * @param webviewView The `IWebviewView` object representing the VS Code chat sidebar panel.
     */
    public resolveWebviewView(webviewView: IWebviewView) {
        this._view = webviewView; // Store the provided webviewView for later access.

        // Sets the title of the webview sidebar panel. By setting it to an empty string,
        // VS Code will typically use the extension's name ("SUGGESTIO") as the title.
        webviewView.title = "";

        // Configure the webview's options, which control its behavior and capabilities.
        // This corresponds to `vscode.WebviewOptions`.
        this._view.webview.options = {
            enableScripts: true, // Allows JavaScript to run inside the webview, enabling interactivity.
            localResourceRoots: [this._context.extensionUri] // Specifies URIs from which the webview can load local resources
                                                            // (like scripts, stylesheets). Here, it's restricted to the
                                                            // extension's own directory for security.
        };

        // Construct a URI for the `renderMarkDown.js` script.
        // `asWebviewUri` is crucial: it converts a local file URI into a special URI
        // that the webview can safely load, adhering to VS Code's security policies.
        // `vscodeApi.Uri.joinPath` constructs a new URI by joining path segments.
        const scriptUri = this._view.webview.asWebviewUri(
            this._vscodeApi.Uri.joinPath(this._context.extensionUri, 'builtResources', 'renderMarkDown.js')
        );

        // Construct a URI for the `highlight.css` stylesheet, similarly converted for webview use.
        const highlightCssUri = this._view.webview.asWebviewUri(
            this._vscodeApi.Uri.joinPath(this._context.extensionUri, 'media', 'highlight.css')
        );

        // Retrieve the list of available models and the currently active model from the provider accessor.
        const models = this._providerAccessor.getModels();
        const activeModel = this._providerAccessor.getActiveModel();

        // Generate the full HTML content for the webview using the `_getChatWebviewContent` function.
        // This HTML will include references to the `scriptUri` and `highlightCssUri` generated above.
        // The `webview.html` property (corresponding to `vscode.Webview.html`) sets the content
        // displayed inside the webview panel.
        this._view.webview.html = this._getChatWebviewContent({
            extensionUri: this._context.extensionUri,
            scriptUri,
            highlightCssUri,
            models,
            activeModel
        });

        // Set up the message listener to handle communication from the webview (frontend).
        this.setupMessageHandler(this._view);
    }

    /**
     * `setupMessageHandler` configures the listener for messages sent *from* the webview.
     * This is the primary way the webview (e.g., user input, model selection) communicates
     * back to the VS Code extension.
     *
     * @param webviewView The `IWebviewView` whose webview will be listening for messages.
     */
    private setupMessageHandler(webviewView: IWebviewView) {
        // `onDidReceiveMessage` (from `vscode.Webview.onDidReceiveMessage`) registers an event handler
        // that is called whenever the webview sends a message to the extension.
        webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
            // Check the `command` property of the message to determine the action to take.
            if (message.command === 'sendMessage') {
                // Handle a message sent by the user from the webview to initiate a chat response.
                try {
                    // Combine the dynamically built context with the user's message text.
                    const promptWithContext = `${this._buildContext()}\n\n${message.text}`;
                    // Call the `logicHandler` to fetch a streaming chat response.
                    // The `onToken` callback is invoked for each partial token received from the LLM.
                    await this._logicHandler.fetchStreamChatResponse(promptWithContext, (token: string) => {
                        // For each token, post a 'token' type message back to the webview.
                        // `webview.postMessage` (from `vscode.Webview.postMessage`) sends data
                        // from the extension to the webview.
                        webviewView.webview.postMessage({
                            sender: 'assistant',
                            type: 'token',
                            text: token
                        });
                    });
                    // After all tokens are received, post a 'completion' message to signal the end of the response.
                    webviewView.webview.postMessage({
                        sender: 'assistant',
                        type: 'completion',
                        text: ''
                    });
                } catch (error) {
                    // If an error occurs during the chat response, post an error message back to the webview.
                    webviewView.webview.postMessage({
                        sender: 'assistant',
                        text: 'Sorry, there was an error processing your request: ' + error
                    });
                }
            } else if (message.command === 'modelChanged') {
                // Handle a message indicating that the active model has changed in the webview.
                // Emit a 'modelChanged' event on the global event bus, allowing other parts
                // of the extension to react to this change.
                eventBus.emit('modelChanged', message.model);
            } else if (message.command === 'clearHistory') {
                // Handle a message requesting to clear the chat history.
                // Call the `clearHistory` method on the `logicHandler`.
                // TODO: Add a UI element (icon/button) in the webview to trigger this command.
                this._logicHandler.clearHistory();
            }
        });
    }
}
