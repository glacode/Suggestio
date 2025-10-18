
import * as vscode from 'vscode';
import { getChatWebviewContent } from './chatWebview.js';
import { ChatLogicHandler } from './chatLogicHandler.js';
import { Config } from '../config/types.js';
import { buildContext } from './context.js';
import { getActiveProvider } from '../providers/providerFactory.js';
import { log } from '../logger.js';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'suggestio.chat.view';

    public _view?: vscode.WebviewView; // This is made public to avoid the 'unused variable' error. It will be used to interact with the webview, for example, to send messages to it.
    private readonly _logicHandler: ChatLogicHandler;
    private readonly _buildContext: () => string;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _config: Config
    ) {
        this._logicHandler = new ChatLogicHandler(this._config, getActiveProvider(this._config)!, log);
        this._buildContext = buildContext;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [ this._context.extensionUri ]
        };

        const scriptUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, 'builtResources', 'renderMarkDown.js')
        );

        const highlightCssUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, 'media', 'highlight.css')
        );

        this._view.webview.html = getChatWebviewContent(this._context.extensionUri, scriptUri, highlightCssUri);

        this.setupMessageHandler(this._view);
    }

    private setupMessageHandler(webviewView: vscode.WebviewView) {
        webviewView.webview.onDidReceiveMessage(async message => {
            if (message.command === 'sendMessage') {
                try {
                    const promptWithContext = `${message.text}\n\n${this._buildContext()}`;
                    await this._logicHandler.fetchStreamCompletion(promptWithContext, (token) => {
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
            }
        });
    }
}
