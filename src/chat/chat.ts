import * as vscode from 'vscode';
import { getChatWebviewContent } from './chatWebview.js';
import { ChatLogicHandler } from './chatLogic.js';
import { Config } from '../config/types.js';
import { buildContext } from './context.js';

export class Chat {
    private readonly _view: vscode.WebviewPanel;
    private readonly _logicHandler: ChatLogicHandler;

    constructor( config: Config ) {
        this._view = vscode.window.createWebviewPanel(
            'suggestioChat',
            'Suggestio Chat',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this._logicHandler = new ChatLogicHandler(config);
        this._view.webview.html = getChatWebviewContent();
        
        this.setupMessageHandler();
    }

    private setupMessageHandler() {
        this._view.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'sendMessage':
                        try {
                            const promptWithContext = `${message.text}\n\n${buildContext()}`;
                            const response = await this._logicHandler.processMessage(promptWithContext);
                            this._view.webview.postMessage({
                                sender: 'assistant',
                                text: response
                            });
                        } catch (error) {
                            this._view.webview.postMessage({
                                sender: 'assistant',
                                text: 'Sorry, there was an error processing your request: ' + error
                            });
                        }
                        break;
                }
            }
        );
    }
}
