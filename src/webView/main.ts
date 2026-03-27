import { ChatManager, InitialState } from './chat.js';
import { IWebviewApi } from '../types.js';

declare const acquireVsCodeApi: () => IWebviewApi;
declare const window: Window & { 
    initialState: InitialState;
};

// Bootstrap the Chat UI
const vscode = acquireVsCodeApi();
const chatManager = new ChatManager(vscode, window.initialState);

document.addEventListener('DOMContentLoaded', () => {
    chatManager.init();
});
