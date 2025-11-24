import * as vscode from 'vscode';
import type { IChatResponder, BuildContext, GetChatWebviewContent, IProviderAccessor } from './types.js';

import { eventBus } from '../events/eventBus.js';

interface IChatViewProviderArgs {
    extensionContext: vscode.ExtensionContext;
    providerAccessor: IProviderAccessor;
    logicHandler: IChatResponder;
    buildContext: BuildContext;
    getChatWebviewContent: GetChatWebviewContent;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'suggestio.chat.view';

    public _view?: vscode.WebviewView;
    private readonly _logicHandler: IChatResponder;
    private readonly _buildContext: BuildContext;
    private readonly _context: vscode.ExtensionContext;
    private readonly _providerAccessor: IProviderAccessor;
    private readonly _getChatWebviewContent: GetChatWebviewContent;

    constructor({ extensionContext, providerAccessor, logicHandler, buildContext, getChatWebviewContent }: IChatViewProviderArgs) {
        this._context = extensionContext;
        this._providerAccessor = providerAccessor;
        this._logicHandler = logicHandler;
        this._buildContext = buildContext;
        this._getChatWebviewContent = getChatWebviewContent;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        // instead of “SUGGESTIO: CHAT” , the sidebar title becomes "SUGGESTIO"
        webviewView.title = "";

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        const scriptUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, 'builtResources', 'renderMarkDown.js')
        );

        const highlightCssUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, 'media', 'highlight.css')
        );

        const models = this._providerAccessor.getModels();
        const activeModel = this._providerAccessor.getActiveModel();

        this._view.webview.html = this._getChatWebviewContent({
            extensionUri: this._context.extensionUri,
            scriptUri,
            highlightCssUri,
            models,
            activeModel
        });

        this.setupMessageHandler(this._view);
    }

    private setupMessageHandler(webviewView: vscode.WebviewView) {
        webviewView.webview.onDidReceiveMessage(async message => {
            if (message.command === 'sendMessage') {
                try {
                    const promptWithContext = `${this._buildContext()}\n\n${message.text}`;
                    await this._logicHandler.fetchStreamChatResponse(promptWithContext, (token) => {
                        webviewView.webview.postMessage({
                            sender: 'assistant',
                            type: 'token',
                            text: token
                        });
                    });
                    webviewView.webview.postMessage({
                        sender: 'assistant',
                        type: 'completion',
                        text: ''
                    });
                } catch (error) {
                    webviewView.webview.postMessage({
                        sender: 'assistant',
                        text: 'Sorry, there was an error processing your request: ' + error
                    });
                }
            } else if (message.command === 'modelChanged') {
                eventBus.emit('modelChanged', message.model);
            } else if (message.command === 'clearHistory') {
                //TODO add a clear history icon/button in the webview UI
                this._logicHandler.clearHistory();
            }
        });
    }
}
