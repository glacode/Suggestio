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

    describe('setupCompletionProfileSelector', () => {
        it('should render profiles and handle selection', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            const profiles = ['profile-a', 'profile-b'];
            settingsOverlay.setupCompletionProfileSelector(mockVscode, profiles, 'profile-a');
            
            const selectedLabel = document.querySelector('.selected-profile');
            expect(selectedLabel?.textContent).toBe('profile-a');
            
            const options = document.querySelector('.profile-options');
            expect(options?.children.length).toBe(2);
            
            // Toggle options
            if (!(selectedLabel instanceof HTMLElement)) { throw new Error('Selected label not found'); }
            selectedLabel.click();
            if (!(options instanceof HTMLElement)) { throw new Error('Options container not found'); }
            expect(options.style.display).toBe('block');
            
            // Select profile-b
            const optionB = options.querySelectorAll('a')[1];
            if (!(optionB instanceof HTMLElement)) { throw new Error('Option B not found'); }
            optionB.click();
            
            expect(selectedLabel.textContent).toBe('profile-b');
            expect(options.style.display).toBe('none');
            expect(mockVscode.messages).toContainEqual({
                command: WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED,
                model: 'profile-b'
            });
        });

        it('should toggle options when clicking selected profile', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            
            const selected = document.querySelector('.selected-profile');
            const options = document.querySelector('.profile-options');
            if (!(selected instanceof HTMLElement) || !(options instanceof HTMLElement)) {
                throw new Error('Elements not found');
            }
            
            selected.click();
            expect(options.style.display).toBe('block');
            selected.click();
            expect(options.style.display).toBe('none');
        });

        it('should close options when clicking outside the overlay', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            
            const selected = document.querySelector('.selected-profile');
            const options = document.querySelector('.profile-options');
            if (!(selected instanceof HTMLElement) || !(options instanceof HTMLElement)) {
                throw new Error('Elements not found');
            }
            
            selected.click();
            expect(options.style.display).toBe('block');
            
            // Click outside
            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(options.style.display).toBe('none');
        });

        it('should not close options when clicking inside the overlay', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            
            const selected = document.querySelector('.selected-profile');
            const options = document.querySelector('.profile-options');
            if (!(selected instanceof HTMLElement) || !(options instanceof HTMLElement)) {
                throw new Error('Elements not found');
            }
            
            selected.click();
            expect(options.style.display).toBe('block');
            
            // Click inside
            const title = document.querySelector('.settings-title');
            if (!(title instanceof HTMLElement)) { throw new Error('Title not found'); }
            title.click();
            expect(options.style.display).toBe('block');
        });

        it('should do nothing if not initialized', () => {
            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            expect(document.querySelector('.settings-section')).toBeNull();
        });

        it('should clear existing content before rendering new selector', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            const firstSection = document.querySelector('.settings-section');
            expect(firstSection).toBeTruthy();
            
            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['b'], 'b');
            const sections = document.querySelectorAll('.settings-section');
            expect(sections.length).toBe(1);
            expect(sections[0].textContent).toContain('b');
        });

        it('should handle error in postMessage gracefully', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            jest.spyOn(mockVscode, 'postMessage').mockImplementation(() => {
                throw new Error('Mock error');
            });

            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            const options = document.querySelector('.profile-options');
            const a = options?.querySelector('a');
            a?.click();

            // Should not throw
            expect(true).toBe(true);
        });

        it('should return early if body element is missing', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            const overlay = document.getElementById('settingsOverlay');
            const body = overlay?.querySelector('.settings-body');
            body?.remove();

            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            expect(document.querySelector('.settings-section')).toBeNull();
        });

        it('should return early if selected-profile is missing from template', () => {
            const container = document.querySelector('.chat-container');
            if (!(container instanceof HTMLElement)) { throw new Error('Container not found'); }
            settingsOverlay.initOverlay(container);
            
            const originalCreateElement = document.createElement.bind(document);
            jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
                const el = originalCreateElement(tagName);
                if (tagName === 'div' && el instanceof HTMLDivElement) {
                    const storage = new Map<HTMLElement, string>();
                    Object.defineProperty(el, 'innerHTML', {
                        set(html: string) {
                            if (html.includes('profile-selector')) {
                                this.textContent = 'corrupted'; 
                            } else {
                                storage.set(this, html);
                            }
                        },
                        get() { return storage.get(this) || ''; },
                        configurable: true
                    });
                }
                return el;
            });

            settingsOverlay.setupCompletionProfileSelector(mockVscode, ['a'], 'a');
            expect(document.querySelector('.selected-profile')).toBeNull();
            jest.restoreAllMocks();
        });
    });
});
