/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockWebviewApi } from '../testUtils.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';
import { DeleteLlmProfile } from '../../src/webView/deleteLlmProfile.js';
import { ProfileMetadata } from '../../src/types.js';

describe('DeleteLlmProfile Unit Tests (Behavioral)', () => {
    let mockVscode: MockWebviewApi;
    let deleteLlmProfile: DeleteLlmProfile;
    let container: HTMLElement;
    let onDoneCalled = false;

    const mockProfile: ProfileMetadata = {
        id: 'delete-me',
        model: 'some-model',
        endpoint: 'https://api.com',
        needsApiKey: true,
        hasApiKey: true,
        apiKeyIdentifier: 'KEY',
        origin: 'user',
        supportsTools: true,
        excludeFromChat: false,
        isActiveChat: false,
        isActiveCompletion: false
    };

    beforeEach(() => {
        onDoneCalled = false;
        deleteLlmProfile = new DeleteLlmProfile(() => { onDoneCalled = true; });
        container = document.createElement('div');
        document.body.innerHTML = '';
        document.body.appendChild(container);
        mockVscode = new MockWebviewApi();
    });

    it('should render confirmation text with profile ID', () => {
        deleteLlmProfile.render(container, mockVscode, mockProfile);

        expect(container.textContent).toContain('Are you sure you want to delete the profile "delete-me"?');
        expect(container.textContent).toContain('Note: Any stored API keys for this profile will NOT be removed');
    });

    it('should post DELETE_PROFILE and call onDone when confirmed', () => {
        deleteLlmProfile.render(container, mockVscode, mockProfile);
        
        const confirmBtn = container.querySelector('#confirmDeleteBtn');
        if (!(confirmBtn instanceof HTMLButtonElement)) { throw new Error('btn missing'); }

        confirmBtn.click();

        expect(mockVscode.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.DELETE_PROFILE,
            profileId: 'delete-me'
        });
        expect(onDoneCalled).toBe(true);
    });

    it('should call onDone when cancelled', () => {
        deleteLlmProfile.render(container, mockVscode, mockProfile);
        
        const cancelBtn = container.querySelector('#cancelDeleteBtn');
        if (!(cancelBtn instanceof HTMLButtonElement)) { throw new Error('btn missing'); }

        cancelBtn.click();

        expect(mockVscode.messages.length).toBe(0);
        expect(onDoneCalled).toBe(true);
    });
});
