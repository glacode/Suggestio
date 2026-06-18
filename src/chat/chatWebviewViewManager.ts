import type {
    IWebviewView,
    IExtensionContextMinimal,
    IProfileMetadataProvider,
    GetChatWebviewContent,
    IVscodeApiLocal,
    IFileContentReader,
    IConfigContainer,
    IPersistentChatHistoryManager,
    IChatWebviewViewManager
} from '../types.js';
import { EXTENSION_EVENTS, EXTENSION_COMMANDS } from '../constants/protocol.js';
import { getNonce } from '../utils/textUtils.js';

/**
 * `ChatWebviewViewManager` handles the UI state and content of the chat webview.
 * It is responsible for generating HTML, managing asset URIs, and sending
 * UI control messages.
 */
export class ChatWebviewViewManager implements IChatWebviewViewManager {
    private _view?: IWebviewView;
    private readonly _extensionContext: IExtensionContextMinimal;
    private readonly _profileMetadataProvider: IProfileMetadataProvider;
    private readonly _getChatWebviewContent: GetChatWebviewContent;
    private readonly _vscodeApi: IVscodeApiLocal;
    private readonly _fileReader: IFileContentReader;
    private readonly _configContainer: IConfigContainer;
    private readonly _chatHistoryManager: IPersistentChatHistoryManager;

    constructor(
        extensionContext: IExtensionContextMinimal,
        profileMetadataProvider: IProfileMetadataProvider,
        getChatWebviewContent: GetChatWebviewContent,
        vscodeApi: IVscodeApiLocal,
        fileReader: IFileContentReader,
        configContainer: IConfigContainer,
        chatHistoryManager: IPersistentChatHistoryManager
    ) {
        this._extensionContext = extensionContext;
        this._profileMetadataProvider = profileMetadataProvider;
        this._getChatWebviewContent = getChatWebviewContent;
        this._vscodeApi = vscodeApi;
        this._fileReader = fileReader;
        this._configContainer = configContainer;
        this._chatHistoryManager = chatHistoryManager;
    }

    public setView(view: IWebviewView | undefined): void {
        this._view = view;
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

    public showSettings() {
        if (this._view) {
            this._view.webview.postMessage({ command: EXTENSION_COMMANDS.OPEN_SETTINGS });
        }
    }

    public showHistory() {
        if (this._view) {
            this._view.webview.postMessage({ command: EXTENSION_COMMANDS.OPEN_HISTORY });
        }
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
}
