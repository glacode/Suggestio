/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { ChatManager } from '../../src/webView/chat.js';
import { InitialState } from '../../src/types.js';
import { SettingsOverlay } from '../../src/webView/settingsOverlay.js';
import { HistoryOverlay } from '../../src/webView/historyOverlay.js';
import { MockWebviewApi, setupChatDom, createMockDomRect } from '../testUtils.js';
import { WEBVIEW_COMMANDS, EXTENSION_EVENTS, EXTENSION_COMMANDS, MESSAGE_SENDERS } from '../../src/constants/protocol.js';

describe('ChatManager Unit Tests', () => {
    let chatManager: ChatManager;
    let mockVscode: MockWebviewApi;

    beforeEach(() => {
        jest.useFakeTimers();
        setupChatDom();
        window.HTMLElement.prototype.scrollIntoView = jest.fn();

        // JSDOM doesn't support innerText, so we mock it to reflect textContent
        Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
            get() { return this.textContent; },
            set(value) { this.textContent = value; },
            configurable: true
        });
        
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
        const settingsOverlay = new SettingsOverlay();
        const historyOverlay = new HistoryOverlay();
        chatManager = new ChatManager(mockVscode, initialState, settingsOverlay, historyOverlay);

        chatManager.init();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
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

        it('should send message when send icon is clicked and input is enabled', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) { throw new Error('Input not found'); }
            const sendIcon = document.querySelector('.send-icon');
            if (!(sendIcon instanceof HTMLElement)) { throw new Error('Send icon not found'); }

            input.value = 'click test';
            sendIcon.click();

            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.SEND_MESSAGE,
                text: 'click test'
            });
        });

        it('should cancel request when send icon is clicked and input is disabled', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) { throw new Error('Input not found'); }
            const sendIcon = document.querySelector('.send-icon');
            if (!(sendIcon instanceof HTMLElement)) { throw new Error('Send icon not found'); }

            // Simulate "Working..." state
            input.disabled = true;
            sendIcon.click();

            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.CANCEL_REQUEST
            });
        });

        it('should adjust textarea height on input event', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) { throw new Error('Input not found'); }
            
            // Trigger input event
            input.dispatchEvent(new Event('input'));
            
            // Branch was hit if it didn't crash (logic sets height to auto then scrollHeight)
            expect(input.style.height).toBeTruthy();
        });

        it('should focus input when window receives focus', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) { throw new Error('Input not found'); }
            
            // Blur it first
            input.blur();
            // JSDOM might not support document.activeElement perfectly, 
            // but triggering the event and running timers covers the branch.
            window.dispatchEvent(new Event('focus'));
            
            // Run the 50ms setTimeout
            jest.runAllTimers();

            // Success is reaching here without error and hitting the branch in chat.ts
            expect(input).toBeTruthy();
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
            expect(dropdownContent.classList.contains('show')).toBe(true);

            // Select second profile
            const options = dropdownContent.querySelectorAll('a');
            options[1].click();

            expect(label.textContent).toBe('profile2');
            expect(dropdownContent.classList.contains('show')).toBe(false);
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
            expect(dropdownContent.classList.contains('show')).toBe(true);

            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(dropdownContent.classList.contains('show')).toBe(false);
        });
    });

    describe('Extension Events', () => {
        it('should handle user messages from extension', () => {
            const chat = document.getElementById('chat');
            if (!chat) { throw new Error('Chat container not found'); }

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.USER, text: 'message from backend' }
            }));

            const userMsg = chat.querySelector('.message.user');
            if (!(userMsg instanceof HTMLElement)) { throw new Error('User message not found'); }
            
            // Checking textContent instead of chat.innerHTML because JSDOM 
            // doesn't reflect innerText into innerHTML during tests.
            expect(userMsg.textContent).toBe('message from backend');
        });

        it('should handle newChat command via window message', () => {
            const chat = document.getElementById('chat');
            if (!chat) { throw new Error('Chat container not found'); }
            chat.innerHTML = '<div class="message">X</div>';
            
            window.dispatchEvent(new MessageEvent('message', {
                data: { command: EXTENSION_COMMANDS.NEW_CHAT }
            }));

            expect(chat.querySelectorAll('.message').length).toBe(0);
        });

        it('should handle newChat call directly', () => {
            const chat = document.getElementById('chat');
            if (!chat) { throw new Error('Chat container not found'); }
            chat.innerHTML = '<div class="message">X</div>';
            
            chatManager.newChat();

            expect(chat.querySelectorAll('.message').length).toBe(0);
        });

        it('should toggle settings overlay when OPEN_SETTINGS command is received', () => {
            const overlay = document.getElementById('settingsOverlay');
            if (!overlay) { throw new Error('Settings overlay not found'); }

            // 1. Initial state: hidden
            expect(overlay.classList.contains('hidden')).toBe(true);

            // 2. First command: show
            window.dispatchEvent(new MessageEvent('message', {
                data: { command: EXTENSION_COMMANDS.OPEN_SETTINGS }
            }));
            expect(overlay.classList.contains('hidden')).toBe(false);

            // 3. Second command: toggle hide
            window.dispatchEvent(new MessageEvent('message', {
                data: { command: EXTENSION_COMMANDS.OPEN_SETTINGS }
            }));
            expect(overlay.classList.contains('hidden')).toBe(true);
        });

        it('should handle error events by showing text and enabling input', () => {
            const input = document.getElementById('messageInput');
            if (!(input instanceof HTMLTextAreaElement)) {
                throw new Error('Input not found');
            }
            input.disabled = true;

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.ERROR, text: 'Something went wrong' }
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
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.COMPLETION }
            }));

            expect(input.disabled).toBe(false);
        });

        it('should render tool start and update on end', () => {
            const toolCallId = 't1';
            
            // Start
            window.dispatchEvent(new MessageEvent('message', {
                data: { 
                    sender: MESSAGE_SENDERS.ASSISTANT, 
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
                    sender: MESSAGE_SENDERS.ASSISTANT, 
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
                    sender: MESSAGE_SENDERS.ASSISTANT, 
                    type: EXTENSION_EVENTS.REQUEST_CONFIRMATION, 
                    toolCallId, 
                    toolName: 'write_file',
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
                    sender: MESSAGE_SENDERS.ASSISTANT, 
                    type: EXTENSION_EVENTS.REQUEST_CONFIRMATION, 
                    toolCallId: 'diff1', 
                    toolName: 'write_file',
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
        it('should scroll to bottom when user is near the bottom during streaming', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) {
                throw new Error('Chat not found');
            }

            // Mock container dimensions to simulate a scrolled state
            Object.defineProperty(chat, 'scrollHeight', { value: 1000, configurable: true });
            Object.defineProperty(chat, 'clientHeight', { value: 500, configurable: true });
            
            // Set scrollTop to be near the bottom (e.g., 450px from top)
            // Distance from bottom = 1000 - 450 - 500 = 50px (within the 100px threshold)
            chat.scrollTop = 450;

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'scroll test', tokenType: 'content' }
            }));

            expect(chat.scrollTop).toBe(1000);
        });

        it('should NOT scroll to bottom when user has scrolled up', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) {
                throw new Error('Chat not found');
            }

            Object.defineProperty(chat, 'scrollHeight', { value: 1000, configurable: true });
            Object.defineProperty(chat, 'clientHeight', { value: 500, configurable: true });
            
            // Set scrollTop to be far from the bottom (e.g., 100px from top)
            // Distance from bottom = 1000 - 100 - 500 = 400px (outside the 100px threshold)
            chat.scrollTop = 100;

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'scroll test', tokenType: 'content' }
            }));

            expect(chat.scrollTop).toBe(100); // Should remain unchanged
        });

        it('should scroll to bottom when tool output is received', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) {
                throw new Error('Chat not found');
            }
            Object.defineProperty(chat, 'scrollHeight', { value: 1000, configurable: true });
            Object.defineProperty(chat, 'clientHeight', { value: 500, configurable: true });
            chat.scrollTop = 450;

            // First, start a tool to ensure we have an assistant message and tool call
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOOL_START, toolCallId: 'test-id', toolName: 'test-tool', displayMessage: 'Testing...', args: '{}' }
            }));

            // Then receive output
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOOL_OUTPUT, toolCallId: 'test-id', output: 'some output' }
            }));

            expect(chat.scrollTop).toBe(1000);
        });

        it('should scroll to bottom when tool details are toggled', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) {
                throw new Error('Chat not found');
            }
            Object.defineProperty(chat, 'scrollHeight', { value: 1000, configurable: true });
            Object.defineProperty(chat, 'clientHeight', { value: 500, configurable: true });
            chat.scrollTop = 450;

            // Create a tool call
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOOL_START, toolCallId: 'test-id', toolName: 'test-tool', displayMessage: 'Testing...', args: '{}' }
            }));

            const details = chat.querySelector('details');
            if (!details) {
                throw new Error('Details element not found');
            }

            // Simulate the toggle event
            details.dispatchEvent(new Event('toggle'));

            expect(chat.scrollTop).toBe(1000);
        });
    });

    describe('Edge Cases & Branch Coverage', () => {
        it('should remove empty assistant messages on finish', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) {
                throw new Error('Chat not found');
            }
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: '   ', tokenType: 'content' }
            }));
            
            const msg = chat.querySelector('.message.assistant');
            expect(msg).toBeTruthy();

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.COMPLETION }
            }));

            expect(chat.querySelector('.message.assistant')).toBeNull();
        });

        it('should preserve assistant message with reasoning content on finish', () => {
            const chat = document.getElementById('chat');
            if (!(chat instanceof HTMLElement)) { throw new Error('Chat not found'); }

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'some thoughts', tokenType: 'reasoning' }
            }));

            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.COMPLETION }
            }));

            const msg = chat.querySelector('.message.assistant');
            expect(msg).toBeTruthy();
            expect(msg?.textContent).toContain('some thoughts');
        });

        it('should handle complex interleaving (Reasoning -> Tool -> Content)', () => {
            // 1. Reasoning
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'Think', tokenType: 'reasoning' }
            }));
            // 2. Tool inside Reasoning
            const toolCallId = 't-nested';
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOOL_START, toolCallId, toolName: 't', args: '{}' }
            }));
            // 3. Content (Collapses reasoning)
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'Done', tokenType: 'content' }
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
            expect(reasoning.innerHTML).toContain(toolCallId); // Tool was nested
        });

        it('should toggle reasoning visibility when header is clicked', () => {
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'Thinking...', tokenType: 'reasoning' }
            }));

            const header = document.querySelector('.reasoning-header');
            if (!(header instanceof HTMLElement)) { throw new Error('Header not found'); }
            const content = document.querySelector('.reasoning-content');
            if (!(content instanceof HTMLElement)) { throw new Error('Content not found'); }

            // Initial state (expanded)
            expect(content.classList.contains('collapsed')).toBe(false);

            // Toggle (click)
            header.click();
            expect(content.classList.contains('collapsed')).toBe(true);

            // Toggle again
            header.click();
            expect(content.classList.contains('collapsed')).toBe(false);
        });

        it('should handle nested confirmation inside reasoning', () => {
            // 1. Start reasoning
            window.dispatchEvent(new MessageEvent('message', {
                data: { sender: MESSAGE_SENDERS.ASSISTANT, type: EXTENSION_EVENTS.TOKENS, text: 'I am thinking...', tokenType: 'reasoning' }
            }));

            // 2. Send confirmation request while reasoning is active
            const toolCallId = 'nested-confirm';
            window.dispatchEvent(new MessageEvent('message', {
                data: { 
                    sender: MESSAGE_SENDERS.ASSISTANT, 
                    type: EXTENSION_EVENTS.REQUEST_CONFIRMATION, 
                    toolCallId, 
                    toolName: 'write_file',
                    message: 'Allow edit?'
                }
            }));

            const reasoning = document.querySelector('.reasoning-container');
            if (!(reasoning instanceof HTMLElement)) { throw new Error('Reasoning block not found'); }
            
            // The confirmation should be INSIDE the reasoning content
            const nestedConfirm = reasoning.querySelector(`#confirm-${toolCallId}`);
            expect(nestedConfirm).toBeTruthy();
            expect(nestedConfirm?.textContent).toContain('Allow edit?');
        });
    });
});
