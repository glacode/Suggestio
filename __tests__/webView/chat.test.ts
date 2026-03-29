/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChatManager, InitialState } from '../../src/webView/chat.js';
import { MockWebviewApi, setupChatDom, createMockDomRect } from '../testUtils.js';
import { WEBVIEW_COMMANDS, EXTENSION_EVENTS } from '../../src/constants/protocol.js';

describe('ChatManager Unit Tests', () => {
    let chatManager: ChatManager;
    let mockVscode: MockWebviewApi;

    beforeEach(() => {
        setupChatDom();
        window.HTMLElement.prototype.scrollIntoView = jest.fn();
        
        // Mock getBoundingClientRect on Element prototype to cover all elements
        // We use a factory from testUtils to minimize type assertions in test files
        jest.spyOn(window.Element.prototype, 'getBoundingClientRect').mockReturnValue(createMockDomRect());

        const initialState: InitialState = {
            profiles: ['profile1', 'profile2'],
            activeProfile: 'profile1'
        };
        // Use property assignment to avoid linting warnings about global 'any' casting
        Object.defineProperty(window, 'initialState', { value: initialState, writable: true, configurable: true });
        Object.defineProperty(window, 'renderMarkdown', { 
            value: jest.fn((text: string) => `MD:${text}`),
            writable: true,
            configurable: true
        });

        mockVscode = new MockWebviewApi();
        chatManager = new ChatManager(mockVscode, initialState);
        chatManager.init();
    });

    describe('Messaging & Input', () => {
        it('should post a message to the extension when sendMessage is called', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) {
                throw new Error('Input not found');
            }
            input.value = 'test message';
            chatManager.sendMessage();

            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.SEND_MESSAGE,
                text: 'test message'
            });
            expect(input.value).toBe('');
        });

        it('should not send empty messages', () => {
            chatManager.sendMessage();
            expect(mockVscode.messages.length).toBe(0);
        });

        it('should send cancelRequest when cancelRequest is called', () => {
            chatManager.cancelRequest();
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.CANCEL_REQUEST
            });
        });

        it('should trigger sendMessage on Enter key', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) {
                throw new Error('Input not found');
            }
            input.value = 'enter key test';
            const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
            input.dispatchEvent(event);

            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.SEND_MESSAGE,
                text: 'enter key test'
            });
        });

        it('should allow newlines with Shift+Enter', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) {
                throw new Error('Input not found');
            }
            const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
            const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
            input.dispatchEvent(event);

            expect(preventDefaultSpy).not.toHaveBeenCalled();
            expect(mockVscode.messages.length).toBe(0);
        });
    });

    describe('Profile Selector', () => {
        it('should change profile and post message on selection', () => {
            const label = document.querySelector('.chat-profile-label');
            if (!(label instanceof HTMLElement)) {
                throw new Error('Label not found');
            }
            const dropdownLabel = document.querySelector('.dropdown-label');
            if (!(dropdownLabel instanceof HTMLElement)) {
                throw new Error('Dropdown label not found');
            }
            const dropdownContent = document.querySelector('.dropdown-content');
            if (!(dropdownContent instanceof HTMLElement)) {
                throw new Error('Dropdown content not found');
            }
            
            // Toggle dropdown
            dropdownLabel.dispatchEvent(new MouseEvent('click'));
            expect(dropdownContent.style.display).toBe('block');

            // Select second profile
            const options = dropdownContent.querySelectorAll('a');
            options[1].click();

            expect(label.textContent).toBe('profile2');
            expect(dropdownContent.style.display).toBe('none');
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED,
                model: 'profile2'
            });
        });

        it('should close dropdown when clicking outside', () => {
            const dropdownLabel = document.querySelector('.dropdown-label');
            if (!(dropdownLabel instanceof HTMLElement)) {
                throw new Error('Dropdown label not found');
            }
            const dropdownContent = document.querySelector('.dropdown-content');
            if (!(dropdownContent instanceof HTMLElement)) {
                throw new Error('Dropdown content not found');
            }
            
            dropdownLabel.dispatchEvent(new MouseEvent('click'));
            expect(dropdownContent.style.display).toBe('block');

            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(dropdownContent.style.display).toBe('none');
        });
    });

    describe('Extension Events', () => {
        it('should handle error events by showing text and enabling input', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) {
                throw new Error('Input not found');
            }
            input.disabled = true;

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.ERROR, text: 'Something went wrong' }
            }));

            const chat = document.getElementById('chat');
            if (!chat) {
                throw new Error('Chat not found');
            }
            expect(chat.innerHTML).toContain('Something went wrong');
            expect(input.disabled).toBe(false);
        });

        it('should handle completion event', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) {
                throw new Error('Input not found');
            }
            input.disabled = true;

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.COMPLETION }
            }));

            expect(input.disabled).toBe(false);
        });

        it('should render tool start and update on end', () => {
            const toolCallId = 't1';
            
            // Start
            window.dispatchEvent(new MessageEvent('message', {
                data: { 
                    sender: 'assistant', 
                    type: EXTENSION_EVENTS.TOOL_START, 
                    toolCallId, 
                    toolName: 'test_tool',
                    args: '{}'
                }
            }));
            const toolEl = document.getElementById(`tool-${toolCallId}`);
            if (!toolEl) {
                throw new Error('Tool element not found');
            }
            expect(toolEl).toBeTruthy();

            // End (Success)
            window.dispatchEvent(new MessageEvent('message', {
                data: { 
                    sender: 'assistant', 
                    type: EXTENSION_EVENTS.TOOL_END, 
                    toolCallId, 
                    toolName: 'test_tool',
                    success: true,
                    result: 'Done'
                }
            }));
            expect(toolEl.textContent).toContain('✅');
        });

        it('should handle tool confirmation request and response', () => {
            const toolCallId = 'c1';
            window.dispatchEvent(new MessageEvent('message', {
                data: { 
                    sender: 'assistant', 
                    type: EXTENSION_EVENTS.REQUEST_CONFIRMATION, 
                    toolCallId, 
                    toolName: 'edit_file',
                    message: 'Confirm?'
                }
            }));

            const confirmEl = document.getElementById(`confirm-${toolCallId}`);
            if (!confirmEl) {
                throw new Error('Confirm element not found');
            }
            expect(confirmEl).toBeTruthy();

            const denyBtn = confirmEl.querySelector('.deny-btn');
            if (!(denyBtn instanceof HTMLButtonElement)) {
                throw new Error('Deny button not found');
            }
            denyBtn.click();

            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL,
                toolCallId,
                decision: 'deny'
            });
            // Should be removed from DOM
            expect(document.getElementById(`confirm-${toolCallId}`)).toBeNull();
        });

        it('should handle viewDiff command', () => {
            window.dispatchEvent(new MessageEvent('message', {
                data: { 
                    sender: 'assistant', 
                    type: EXTENSION_EVENTS.REQUEST_CONFIRMATION, 
                    toolCallId: 'diff1', 
                    toolName: 'edit_file',
                    message: 'Diff?',
                    diffData: { old: '', new: '', path: '' }
                }
            }));

            const diffBtn = document.querySelector('.view-diff-btn');
            if (!(diffBtn instanceof HTMLButtonElement)) {
                throw new Error('Diff button not found');
            }
            diffBtn.click();

            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.VIEW_DIFF,
                toolCallId: 'diff1'
            });
        });
    });

    describe('Auto-scrolling Logic', () => {
        it('should attempt to scroll when user message exists', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) {
                throw new Error('Chat not found');
            }
            
            // Mock a user message
            const userMsg = document.createElement('div');
            userMsg.className = 'message user';
            
            // Mock getBoundingClientRect for this specific element instance to trigger scroll (> 25)
            jest.spyOn(userMsg, 'getBoundingClientRect').mockReturnValue(createMockDomRect({
                top: 100
            }));
            
            chat.appendChild(userMsg);
            
            // Access private property for testing
            Object.defineProperty(chatManager, 'lastUserMessageElement', {
                value: userMsg,
                writable: true,
                configurable: true
            });

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.TOKENS, text: 'scroll test', tokenType: 'content' }
            }));

            expect(userMsg.getBoundingClientRect).toHaveBeenCalled();
        });
    });

    describe('Edge Cases in Segments', () => {
        it('should remove empty assistant messages on finish', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) {
                throw new Error('Chat not found');
            }
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.TOKENS, text: '   ', tokenType: 'content' }
            }));
            
            const msg = chat.querySelector('.message.assistant');
            expect(msg).toBeTruthy();

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.COMPLETION }
            }));

            expect(chat.querySelector('.message.assistant')).toBeNull();
        });

        it('should handle complex interleaving (Reasoning -> Tool -> Content)', () => {
            // 1. Reasoning
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.TOKENS, text: 'Think', tokenType: 'reasoning' }
            }));
            // 2. Tool inside Reasoning
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.TOOL_START, toolCallId: 't2', toolName: 't', args: '{}' }
            }));
            // 3. Content (Collapses reasoning)
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: 'assistant', type: EXTENSION_EVENTS.TOKENS, text: 'Done', tokenType: 'content' }
            }));

            const reasoning = document.querySelector('.reasoning-container');
            if (!(reasoning instanceof HTMLElement)) {
                throw new Error('Reasoning container not found');
            }
            const content = reasoning.querySelector('.reasoning-content');
            if (!(content instanceof HTMLElement)) {
                throw new Error('Reasoning content not found');
            }
            expect(content.classList.contains('collapsed')).toBe(true);
            expect(reasoning.innerHTML).toContain('t2'); // Tool was nested
        });
    });
});
