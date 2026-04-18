/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MockWebviewApi } from '../testUtils.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';

describe('settingsOverlay Unit Tests', () => {
    let mockVscode: MockWebviewApi;
    let settingsOverlay: typeof import('../../src/webView/settingsOverlay.js');

    beforeEach(async () => {
        jest.resetModules();
        settingsOverlay = await import('../../src/webView/settingsOverlay.js');
        document.body.innerHTML = '<div class="chat-container"></div>';
        document.body.className = '';
        mockVscode = new MockWebviewApi();
    });

    describe('initOverlay', () => {
        it('should initialize the overlay and append it to the container', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);

            const overlay = document.getElementById('settingsOverlay');
            expect(overlay).toBeTruthy();
            expect(container.contains(overlay!)).toBe(true);
            expect(overlay?.classList.contains('hidden')).toBe(true);
        });

        it('should not initialize multiple times', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            const firstOverlay = document.getElementById('settingsOverlay');
            
            settingsOverlay.initOverlay(container);
            const secondOverlay = document.getElementById('settingsOverlay');
            
            expect(firstOverlay).toBe(secondOverlay);
        });

        it('should hide the overlay when the done button is clicked', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            settingsOverlay.showOverlay();
            
            const doneBtn = document.getElementById('settingsDoneBtn');
            if (!(doneBtn instanceof HTMLButtonElement)) { throw new Error('Done button not found'); }
            
            doneBtn.click();
            
            const overlay = document.getElementById('settingsOverlay');
            expect(overlay?.classList.contains('hidden')).toBe(true);
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });
    });

    describe('showOverlay and hideOverlay', () => {
        it('should show the overlay and add class to body', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            settingsOverlay.showOverlay();
            
            const overlay = document.getElementById('settingsOverlay');
            expect(overlay?.classList.contains('hidden')).toBe(false);
            expect(document.body.classList.contains('overlay-open')).toBe(true);
        });

        it('should focus the done button when shown', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            const doneBtn = document.getElementById('settingsDoneBtn');
            if (!(doneBtn instanceof HTMLButtonElement)) { throw new Error('Done button not found'); }
            const focusSpy = jest.spyOn(doneBtn, 'focus');
            
            settingsOverlay.showOverlay();
            
            expect(focusSpy).toHaveBeenCalled();
        });

        it('should do nothing in showOverlay if not initialized', () => {
            settingsOverlay.showOverlay();
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });

        it('should hide the overlay and remove class from body', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            settingsOverlay.showOverlay();
            
            settingsOverlay.hideOverlay();
            
            const overlay = document.getElementById('settingsOverlay');
            expect(overlay?.classList.contains('hidden')).toBe(true);
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });

        it('should do nothing in hideOverlay if not initialized', () => {
            settingsOverlay.hideOverlay();
            expect(document.body.classList.contains('overlay-open')).toBe(false);
        });
    });

    describe('renderProfileSettings', () => {
        const mockState: any = {
            profileMetadata: [
                {
                    id: 'p1',
                    model: 'model-1',
                    needsApiKey: true,
                    hasApiKey: false,
                    apiKeyPlaceholder: 'P1_KEY',
                    isActiveChat: true,
                    isActiveCompletion: true
                },
                {
                    id: 'p2',
                    model: 'model-2',
                    needsApiKey: false,
                    hasApiKey: false,
                    isActiveChat: false,
                    isActiveCompletion: false
                }
            ]
        };

        it('should render profiles and handle completion profile change', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            settingsOverlay.renderProfileSettings(mockVscode, mockState);
            
            const items = document.querySelectorAll('.profile-item');
            expect(items.length).toBe(2);
            expect(items[0].classList.contains('active')).toBe(true);
            expect(items[0].textContent).toContain('Key ❌');
            expect(items[1].textContent).toContain('No Key Required');
            
            const selectBtn = items[1].querySelector('.select-btn');
            if (!(selectBtn instanceof HTMLElement)) { throw new Error('Select btn not found'); }
            selectBtn.click();
            
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED,
                model: 'p2'
            });
        });

        it('should handle API key edit and delete', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            const stateWithKey = JSON.parse(JSON.stringify(mockState));
            stateWithKey.profileMetadata[0].hasApiKey = true;

            settingsOverlay.renderProfileSettings(mockVscode, stateWithKey);
            
            const p1 = document.querySelectorAll('.profile-item')[0];
            expect(p1.textContent).toContain('Key ✅');

            const editBtn = p1.querySelector('.edit-btn');
            const deleteBtn = p1.querySelector('.delete-btn');

            if (!(editBtn instanceof HTMLElement) || !(deleteBtn instanceof HTMLElement)) {
                throw new Error('Buttons not found');
            }

            editBtn.click();
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.EDIT_API_KEY,
                placeholder: 'P1_KEY'
            });

            deleteBtn.click();
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.DELETE_API_KEY,
                placeholder: 'P1_KEY'
            });
        });

        it('should do nothing if not initialized', () => {
            settingsOverlay.renderProfileSettings(mockVscode, mockState);
            expect(document.querySelector('.profiles-list')).toBeNull();
        });

        it('should return early if body element is missing', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            const overlay = document.getElementById('settingsOverlay');
            const body = overlay?.querySelector('.settings-body');
            body?.remove();

            settingsOverlay.renderProfileSettings(mockVscode, mockState);
            expect(document.querySelector('.profiles-list')).toBeNull();
        });
    });
});
