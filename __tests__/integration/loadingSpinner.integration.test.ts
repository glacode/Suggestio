/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChatManager } from '../../src/webView/chat.js';
import { HistoryOverlay } from '../../src/webView/historyOverlay.js';
import { SettingsOverlay } from '../../src/webView/settingsOverlay.js';
import { MockWebviewApi } from '../testUtils.js';
import { EXTENSION_EVENTS, WEBVIEW_COMMANDS, MESSAGE_SENDERS } from '../../src/constants/protocol.js';

describe('Loading Spinner Integration', () => {
    let chatManager: ChatManager;
    let historyOverlay: HistoryOverlay;
    let mockWebviewApi: MockWebviewApi;
    let initialState: any;

    beforeEach(() => {
        // Setup full DOM with both chat and history overlay
        document.body.innerHTML = `
            <div class="chat-container">
                <div id="chat"></div>
                <div id="loadingOverlay" class="loading-overlay"></div>
                <div class="chat-input">
                    <div class="input-wrapper">
                        <div id="inputLoadingIndicator"></div>
                        <textarea id="messageInput"></textarea>
                        <div class="chat-controls">
                            <div id="modelSelector">
                                <div class="dropdown-label">
                                    <span class="chat-profile-label"></span>
                                </div>
                                <div class="dropdown-content"></div>
                            </div>
                            <div class="send-icon"></div>
                        </div>
                    </div>
                </div>
                <div id="emptyChatContent"></div>
            </div>
            <div class="history-container">
                <div class="history-list"></div>
            </div>
        `;

        // Mock window.renderMarkdown function
        Object.defineProperty(window, 'renderMarkdown', { 
            value: jest.fn((text: string) => `MD:${text}`),
            writable: true,
            configurable: true
        });
        
        // Mock scrollIntoView for jsdom
        window.HTMLElement.prototype.scrollIntoView = jest.fn();

        mockWebviewApi = new MockWebviewApi();
        initialState = {
            chatProfileIds: ['default'],
            activeChatProfileId: 'default',
            allProfileIds: ['default'],
            activeCompletionProfileId: 'default',
            profileMetadata: {},
            disableSanitizer: false
        };

        const settingsOverlay = new SettingsOverlay();
        historyOverlay = new HistoryOverlay();
        chatManager = new ChatManager(
            mockWebviewApi,
            initialState,
            settingsOverlay,
            historyOverlay
        );

        // Initialize overlays
        const historyContainer = document.querySelector('.history-container');
        if (historyContainer instanceof HTMLElement) {
            historyOverlay.init(historyContainer);
        }
        chatManager.init();
    });

    it('should show and hide spinner during complete session loading flow', () => {
        // Setup: Add a test session
        const testSessions = [{
            id: 'test-session-1',
            title: 'Test Session',
            timestamp: Date.now()
        }];

        // 1. Show history overlay and render sessions
        historyOverlay.show();
        historyOverlay.render(mockWebviewApi, testSessions);

        // 2. Verify spinner is not visible initially
        const loadingOverlay = document.getElementById('loadingOverlay');
        expect(loadingOverlay?.classList.contains('visible')).toBe(false);

        // 3. Click on session to trigger loading
        const sessionItem = document.querySelector('.history-item');
        if (sessionItem instanceof HTMLElement) {
            sessionItem.click();
        }

        // 4. Verify spinner is now visible
        expect(loadingOverlay?.classList.contains('visible')).toBe(true);

        // 5. Verify LOAD_SESSION command was sent
        expect(mockWebviewApi.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.LOAD_SESSION,
            sessionId: 'test-session-1'
        });

        // 6. Simulate receiving CHAT_HISTORY_LOADED event
        window.dispatchEvent(new MessageEvent('message', {
            data: {
                type: EXTENSION_EVENTS.CHAT_HISTORY_LOADED,
                history: [{ role: 'user', content: 'Test message' }]
            }
        }));

        // 7. Verify spinner is hidden again
        expect(loadingOverlay?.classList.contains('visible')).toBe(false);

        // 8. Verify chat is not empty (message was loaded)
        const chat = document.getElementById('chat');
        expect(chat?.innerHTML).not.toBe('');
    });

    it('should handle error during session loading gracefully', () => {
        // Setup: Add a test session
        const testSessions = [{
            id: 'test-session-2',
            title: 'Error Test Session',
            timestamp: Date.now()
        }];

        historyOverlay.show();
        historyOverlay.render(mockWebviewApi, testSessions);

        // Click session to start loading
        const sessionItem = document.querySelector('.history-item');
        if (sessionItem instanceof HTMLElement) {
            sessionItem.click();
        }

        // Verify spinner is visible
        const loadingOverlay = document.getElementById('loadingOverlay');
        expect(loadingOverlay?.classList.contains('visible')).toBe(true);

        // Simulate error instead of success
        window.dispatchEvent(new MessageEvent('message', {
            data: {
                sender: MESSAGE_SENDERS.ASSISTANT,
                type: EXTENSION_EVENTS.ERROR,
                text: 'Failed to load session'
            }
        }));

        // Verify spinner is hidden even on error
        expect(loadingOverlay?.classList.contains('visible')).toBe(false);

        // Verify error handling completed (chat may contain error or be cleared)
        const chat = document.getElementById('chat');
        expect(chat).toBeTruthy();
    });

    it('should handle rapid session switching correctly', () => {
        // Setup: Add multiple sessions
        const testSessions = [{
            id: 'session-1',
            title: 'Session 1',
            timestamp: Date.now()
        }, {
            id: 'session-2',
            title: 'Session 2',
            timestamp: Date.now() - 1000
        }];

        historyOverlay.show();
        historyOverlay.render(mockWebviewApi, testSessions);

        // Click first session
        let sessionItems = document.querySelectorAll('.history-item');
        if (sessionItems[0] instanceof HTMLElement) {
            sessionItems[0].click();
        }

        // Verify spinner is visible
        const loadingOverlay = document.getElementById('loadingOverlay');
        expect(loadingOverlay?.classList.contains('visible')).toBe(true);

        // Load first session
        window.dispatchEvent(new MessageEvent('message', {
            data: {
                type: EXTENSION_EVENTS.CHAT_HISTORY_LOADED,
                history: [{ role: 'user', content: 'First message' }]
            }
        }));

        // Verify first session loading completed
        expect(loadingOverlay?.classList.contains('visible')).toBe(false);

        // Click second session quickly
        if (sessionItems[1] instanceof HTMLElement) {
            sessionItems[1].click();
        }

        // Verify spinner is visible again
        expect(loadingOverlay?.classList.contains('visible')).toBe(true);

        // Load second session
        window.dispatchEvent(new MessageEvent('message', {
            data: {
                type: EXTENSION_EVENTS.CHAT_HISTORY_LOADED,
                history: [{ role: 'user', content: 'Second message' }]
            }
        }));

        // Verify second session loading completed
        expect(loadingOverlay?.classList.contains('visible')).toBe(false);
    });
});