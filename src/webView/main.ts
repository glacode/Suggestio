import { ChatManager } from './chat.js';
import { SettingsOverlay } from './settingsOverlay.js';
import { IWebviewApi, InitialState } from '../types.js';

declare const acquireVsCodeApi: () => IWebviewApi;
declare const window: Window & { 
    initialState: InitialState;
};

// Bootstrap the Chat UI
const vscode = acquireVsCodeApi();
const settingsOverlay = new SettingsOverlay();
const chatManager = new ChatManager(vscode, window.initialState, settingsOverlay);

document.addEventListener('DOMContentLoaded', () => {
    chatManager.init();
});
