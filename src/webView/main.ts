import { ChatManager } from './chat.js';
import { SettingsOverlay } from './settingsOverlay.js';
import { HistoryOverlay } from './historyOverlay.js';
import { IWebviewApi, InitialState } from '../types.js';

declare const acquireVsCodeApi: () => IWebviewApi;
declare const window: Window & { 
    initialState: InitialState;
};

// Bootstrap the Chat UI
const vscode = acquireVsCodeApi();
const settingsOverlay = new SettingsOverlay();
const historyOverlay = new HistoryOverlay();
const chatManager = new ChatManager(vscode, window.initialState, settingsOverlay, historyOverlay);

document.addEventListener('DOMContentLoaded', () => {
    chatManager.init();
});
