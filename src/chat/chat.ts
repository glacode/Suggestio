import * as vscode from 'vscode';
import { getChatWebviewContent } from './chatWebview.js';
import { ChatLogicHandler } from './chatLogicHandler.js';
import { Config } from '../config/types.js';
import { buildContext } from './context.js';
import { getActiveProvider } from '../providers/providerFactory.js';
import { log } from '../logger.js';

export interface IVscodeLike {
    window: {
        createWebviewPanel: (
            viewType: string,
            title: string,
            showOptions: any,
            options?: any
        ) => any;
    };
    ViewColumn: { Beside: any };
    Uri: { joinPath: (...args: any[]) => any };
}

// Minimal interface for testing Chat
interface IWebviewPanelLike {
    webview: {
        html: string;
        postMessage(msg: any): Thenable<boolean>;
        onDidReceiveMessage(handler: (msg: any) => void): void;
        asWebviewUri(uri: any): any;
    };
}

export interface IChatParams {
    context: vscode.ExtensionContext;
    config: Config;
    vscode?: IVscodeLike; // optional, mainly for tests
    webViewPanel?: IWebviewPanelLike; // optional, mainly for tests
    logicHandler?: ChatLogicHandler; // optional, mainly for tests
    getWebviewContent?: (scriptUri: vscode.Uri, cssUri: vscode.Uri) => string; // optional, mainly for tests
    buildContext?: () => string; // optional, mainly for tests
}

export class Chat {
    private readonly _webViewPanel: vscode.WebviewPanel;
    private readonly _logicHandler: ChatLogicHandler;
    private readonly _buildContext: () => string;

    constructor(params: IChatParams) {
        const vscodeModule = params.vscode ?? vscode; // use injected VSCode or real one

        this._webViewPanel = params.webViewPanel ?? vscodeModule.window.createWebviewPanel(
            'suggestioChat',
            'Suggestio Chat',
            vscodeModule.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this._logicHandler = params.logicHandler ?? new ChatLogicHandler(params.config, getActiveProvider(params.config)!, log);
        this._buildContext = params.buildContext ?? buildContext;

        // Build the URI for the webview script
        const scriptUri = this._webViewPanel.webview.asWebviewUri(
            vscodeModule.Uri.joinPath(params.context.extensionUri, 'builtResources', 'renderMarkDown.js')
        );

        const highlightCssUri = this._webViewPanel.webview.asWebviewUri(
            vscodeModule.Uri.joinPath(params.context.extensionUri, 'media', 'highlight.css')
        );

        // Set the HTML content
        this._webViewPanel.webview.html = params.getWebviewContent
            ? params.getWebviewContent(scriptUri, highlightCssUri)
            : getChatWebviewContent(params.context.extensionUri, scriptUri, highlightCssUri);

        this.setupMessageHandler();
    }

    private setupMessageHandler() {
        this._webViewPanel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'sendMessage') {
                try {
                    const promptWithContext = `${message.text}\n\n${this._buildContext()}`;
                    await this._logicHandler.fetchStreamCompletion(promptWithContext, (token) => {
                        this._webViewPanel.webview.postMessage({
                            sender: 'assistant',
                            type: 'token',
                            text: token
                        });
                    });
                    this._webViewPanel.webview.postMessage({
                        sender: 'assistant',
                        type: 'completion',
                        text: ''
                    });
                } catch (error) {
                    this._webViewPanel.webview.postMessage({
                        sender: 'assistant',
                        text: 'Sorry, there was an error processing your request: ' + error
                    });
                }
            }
        });
    }
}
