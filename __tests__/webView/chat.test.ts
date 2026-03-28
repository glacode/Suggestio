/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChatManager, InitialState } from '../../src/webView/chat.js';
import { MockWebviewApi, setupChatDom } from '../testUtils.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';

describe('ChatManager Unit Tests', () => {
    let chatManager: ChatManager;
    let mockVscode: MockWebviewApi;

    beforeEach(() => {
        // 1. Setup the DOM
        setupChatDom();

        // 2. Mock browser side-effects not supported by JSDOM
        window.HTMLElement.prototype.scrollIntoView = jest.fn();

        // 3. Mock global window properties
        const initialState: InitialState = {
            profiles: ['profile1', 'profile2'],
            activeProfile: 'profile1'
        };
        // Use property assignment to avoid linting warnings about global 'any' casting
        Object.defineProperty(window, 'initialState', { value: initialState, writable: true });
        Object.defineProperty(window, 'renderMarkdown', { 
            value: jest.fn((text: string) => text),
            writable: true 
        });

        // 4. Initialize ChatManager with Dependency Injection
        mockVscode = new MockWebviewApi();
        chatManager = new ChatManager(mockVscode, initialState);
        chatManager.init();
    });

    it('should post a message to the extension when sendMessage is called', () => {
        const input = document.getElementById('messageInput');
        if (!(input instanceof HTMLTextAreaElement)) {
            throw new Error('Input not found');
        }
        const testMessage = 'Hello Suggestio!';
        
        // Simulate user input
        input.value = testMessage;
        
        // Trigger send
        chatManager.sendMessage();

        // Assert that the VS Code API received the correct message
        expect(mockVscode.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.SEND_MESSAGE,
            text: testMessage
        });

        // Assert that the input was cleared
        expect(input.value).toBe('');
    });
});
