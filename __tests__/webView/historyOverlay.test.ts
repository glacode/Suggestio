/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { HistoryOverlay } from '../../src/webView/historyOverlay.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';
import { setupChatDom, MockWebviewApi } from '../testUtils.js';

describe('HistoryOverlay', () => {
    let overlay: HistoryOverlay;
    let mockWebviewApi: MockWebviewApi;

    beforeEach(() => {
        // Set up DOM
        setupChatDom();
        document.body.innerHTML = `
            <div id="loadingOverlay" class="loading-overlay"></div>
            <div class="history-list"></div>
        `;

        overlay = new HistoryOverlay();
        mockWebviewApi = new MockWebviewApi();
        
        // Initialize overlay
        const container = document.querySelector('.history-list')?.parentElement;
        if (container) {
            overlay.init(container);
        }
    });

    describe('Session Click Handling', () => {
        it('should show loading spinner when session item is clicked', () => {
            // Arrange
            const testSessions = [
                {
                    id: 'test-session-1',
                    title: 'Test Session 1',
                    timestamp: Date.now()
                }
            ];

            // Act: Render sessions
            overlay.render(mockWebviewApi, testSessions);

            // Get the session item and click it
            const sessionItem = document.querySelector('.history-item');
            if (!(sessionItem instanceof HTMLElement)) {
                throw new Error('Session item not found');
            }
            sessionItem.click();

            // Assert: Loading overlay should be visible
            const loadingOverlay = document.getElementById('loadingOverlay');
            expect(loadingOverlay?.classList.contains('visible')).toBe(true);
            
            // Assert: postMessage was called with correct command
            expect(mockWebviewApi.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.LOAD_SESSION,
                sessionId: 'test-session-1'
            });
            
            // Assert: Overlay should be hidden after click
            expect(overlay.isVisible()).toBe(false);
        });

        it('should not show spinner if loading overlay does not exist in DOM', () => {
            // Arrange: Remove loading overlay from DOM
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) {
                loadingOverlay.remove();
            }

            const testSessions = [
                {
                    id: 'test-session-2',
                    title: 'Test Session 2',
                    timestamp: Date.now()
                }
            ];

            // Act: Render and click
            overlay.render(mockWebviewApi, testSessions);
            const sessionItem = document.querySelector('.history-item');
            if (sessionItem instanceof HTMLElement) {
                sessionItem.click();
            }

            // Assert: Should not throw error and postMessage should still be called
            expect(mockWebviewApi.messages.length).toBeGreaterThan(0);
        });
    });

    describe('Render Method', () => {
        it('should render sessions correctly', () => {
            const testSessions = [
                {
                    id: 'session-1',
                    title: 'First Session',
                    timestamp: Date.now() - 86400000 // Yesterday
                },
                {
                    id: 'session-2',
                    title: 'Second Session',
                    timestamp: Date.now()
                }
            ];

            overlay.render(mockWebviewApi, testSessions);

            const sessionItems = document.querySelectorAll('.history-item');
            expect(sessionItems.length).toBe(2);
            
            // Check first session title
            const firstTitle = document.querySelector('.history-session-title')?.textContent;
            expect(firstTitle).toContain('First Session');
        });

        it('should show "No history" message when sessions list is empty', () => {
            overlay.render(mockWebviewApi, []);
            
            const noHistory = document.querySelector('.no-history');
            expect(noHistory).toBeTruthy();
            expect(noHistory?.textContent).toContain('No chat history found');
        });
    });
});