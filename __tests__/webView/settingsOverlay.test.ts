/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MockWebviewApi } from '../testUtils.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';
import { SettingsOverlay } from '../../src/webView/settingsOverlay.js';

describe('SettingsOverlay Unit Tests', () => {
    let mockVscode: MockWebviewApi;
    let settingsOverlay: SettingsOverlay;

    beforeEach(() => {
        settingsOverlay = new SettingsOverlay();
        document.body.innerHTML = '<div class="chat-container"></div>';
        document.body.className = '';
        mockVscode = new MockWebviewApi();
    });

    describe('init', () => {
        it('should initialize the overlay and append it to the container', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);

            const overlay = document.getElementById('settingsOverlay');
            expect(overlay).toBeTruthy();
            expect(container.contains(overlay!)).toBe(true);
            expect(overlay?.classList.contains('hidden')).toBe(true);
        });

        it('should not initialize multiple times', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            const firstOverlay = document.getElementById('settingsOverlay');
            
            settingsOverlay.init(container);
            const secondOverlay = document.getElementById('settingsOverlay');
            
            expect(firstOverlay).toBe(secondOverlay);
        });

        it('should hide the overlay when the done button is clicked', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            settingsOverlay.show();
            
            const doneBtn = document.getElementById('settingsDoneBtn');
            if (!(doneBtn instanceof HTMLButtonElement)) { throw new Error('Done button not found'); }
            
            doneBtn.click();
            
            const overlay = document.getElementById('settingsOverlay');
            expect(overlay?.classList.contains('hidden')).toBe(true);
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });
    });

    describe('show and hide', () => {
        it('should show the overlay and add class to body', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            
            settingsOverlay.show();
            
            const overlay = document.getElementById('settingsOverlay');
            expect(overlay?.classList.contains('hidden')).toBe(false);
            expect(document.body.classList.contains('overlay-open')).toBe(true);
        });

        it('should focus the done button when shown', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            const doneBtn = document.getElementById('settingsDoneBtn');
            if (!(doneBtn instanceof HTMLButtonElement)) { throw new Error('Done button not found'); }
            const focusSpy = jest.spyOn(doneBtn, 'focus');
            
            settingsOverlay.show();
            
            expect(focusSpy).toHaveBeenCalled();
        });

        it('should do nothing in show if not initialized', () => {
            settingsOverlay.show();
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });

        it('should hide the overlay and remove class from body', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            settingsOverlay.show();
            
            settingsOverlay.hide();
            
            const overlay = document.getElementById('settingsOverlay');
            expect(overlay?.classList.contains('hidden')).toBe(true);
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });

        it('should do nothing in hide if not initialized', () => {
            settingsOverlay.hide();
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });

        it('should return correct visibility status with isVisible', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            
            // Not initialized
            expect(settingsOverlay.isVisible()).toBe(false);

            settingsOverlay.init(container);
            // Initialized but hidden
            expect(settingsOverlay.isVisible()).toBe(false);

            settingsOverlay.show();
            expect(settingsOverlay.isVisible()).toBe(true);

            settingsOverlay.hide();
            expect(settingsOverlay.isVisible()).toBe(false);
        });
    });

    describe('render', () => {
        const mockState: any = {
            profileMetadata: [
                {
                    id: 'p1',
                    model: 'model-1',
                    needsApiKey: true,
                    hasApiKey: false,
                    apiKeyIdentifier: 'P1_KEY',
                    origin: 'bundled',
                    isActiveChat: true,
                    isActiveCompletion: true
                },
                {
                    id: 'p2',
                    model: 'model-2',
                    needsApiKey: false,
                    hasApiKey: false,
                    origin: 'user',
                    isActiveChat: false,
                    isActiveCompletion: false
                }
            ]
        };

        it('should render profiles and handle chat/completion profile changes', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            
            // p1 is active for both chat and completion
            // p2 is active for neither
            const testState = JSON.parse(JSON.stringify(mockState));
            testState.profileMetadata[1].supportsTools = true; // Ensure p2 can be used for chat

            settingsOverlay.render(mockVscode, testState);
            
            const items = document.querySelectorAll('.profile-item');
            expect(items.length).toBe(2);
            expect(items[0].classList.contains('active')).toBe(true);
            expect(items[0].textContent).toContain('CHAT');
            expect(items[0].textContent).toContain('COMPLETIONS');
            expect(items[0].textContent).toContain('Key ❌');
            expect(items[1].textContent).toContain('No Key Required');
            
            // Check Chat profile change
            const selectChatBtn = items[1].querySelector('.select-chat-btn');
            if (!(selectChatBtn instanceof HTMLElement)) { throw new Error('Select chat btn not found'); }
            selectChatBtn.click();
            
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED,
                model: 'p2'
            });

            // Check Completion profile change
            const selectCompBtn = items[1].querySelector('.select-completion-btn');
            if (!(selectCompBtn instanceof HTMLElement)) { throw new Error('Select completion btn not found'); }
            selectCompBtn.click();
            
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED,
                model: 'p2'
            });
        });

        it('should handle API key edit and delete', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            
            const stateWithKey = JSON.parse(JSON.stringify(mockState));
            stateWithKey.profileMetadata[0].hasApiKey = true;

            settingsOverlay.render(mockVscode, stateWithKey);
            
            const p1 = document.querySelectorAll('.profile-item')[0];
            expect(p1.textContent).toContain('Key ✅');

            const editKeyBtn = p1.querySelector('.edit-key-btn');
            const deleteKeyBtn = p1.querySelector('.delete-key-btn');

            if (!(editKeyBtn instanceof HTMLElement) || !(deleteKeyBtn instanceof HTMLElement)) {
                throw new Error('Buttons not found');
            }

            editKeyBtn.click();
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.EDIT_API_KEY,
                identifier: 'P1_KEY'
            });

            deleteKeyBtn.click();
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.DELETE_API_KEY,
                identifier: 'P1_KEY'
            });
        });

        it('should only show structural edit and delete button for user profiles', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            
            settingsOverlay.render(mockVscode, mockState);
            
            const items = document.querySelectorAll('.profile-item');
            
            // p1 is 'bundled' -> no structural edit, no delete profile
            expect(items[0].querySelector('.edit-profile-btn')).toBeNull();
            expect(items[0].querySelector('.delete-profile-btn')).toBeNull();
            
            // p2 is 'user' -> has structural edit and delete profile
            expect(items[1].querySelector('.edit-profile-btn')).not.toBeNull();
            expect(items[1].querySelector('.delete-profile-btn')).not.toBeNull();
        });

        it('should transition to delete confirmation page when trash icon is clicked', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            
            // p2 is 'user' origin
            settingsOverlay.render(mockVscode, mockState);
            
            const items = document.querySelectorAll('.profile-item');
            const deleteBtn = items[1].querySelector('.delete-profile-btn');
            if (!(deleteBtn instanceof HTMLButtonElement)) { throw new Error('delete btn missing'); }

            deleteBtn.click();

            // The body should now contain the delete confirmation title
            const body = container.querySelector('.settings-body');
            expect(body?.textContent).toContain('Delete Profile?');
            expect(body?.textContent).toContain('p2');
        });

        it('should do nothing if not initialized', () => {
            settingsOverlay.render(mockVscode, mockState);
            expect(document.querySelector('.profiles-list')).toBeNull();
        });

        it('should return early if body element is missing', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.init(container);
            
            const overlay = document.getElementById('settingsOverlay');
            const body = overlay?.querySelector('.settings-body');
            body?.remove();

            settingsOverlay.render(mockVscode, mockState);
            expect(document.querySelector('.profiles-list')).toBeNull();
        });
    });
});
