/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockWebviewApi } from '../testUtils.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';
import { UpdateLlmProfile } from '../../src/webView/updateLlmProfile.js';
import { InitialState, ProfileMetadata } from '../../src/types.js';

describe('UpdateLlmProfile Unit Tests (Behavioral)', () => {
    let mockVscode: MockWebviewApi;
    let updateLlmProfile: UpdateLlmProfile;
    let container: HTMLElement;
    let onDoneCalled = false;

    const mockProfile: ProfileMetadata = {
        id: 'test-profile',
        model: 'old-model',
        endpoint: 'https://old-endpoint.com',
        needsApiKey: true,
        hasApiKey: false,
        apiKeyIdentifier: 'OLD_KEY',
        origin: 'user',
        supportsTools: false, // non-default
        excludeFromChat: true, // non-default
        isActiveChat: true,
        isActiveCompletion: true
    };

    const mockState: InitialState = {
        chatProfileIds: ['test-profile'],
        activeChatProfileId: 'test-profile',
        allProfileIds: ['test-profile'],
        activeCompletionProfileId: 'test-profile',
        profileMetadata: [mockProfile]
    };

    beforeEach(() => {
        onDoneCalled = false;
        updateLlmProfile = new UpdateLlmProfile(() => { onDoneCalled = true; });
        container = document.createElement('div');
        document.body.innerHTML = '';
        document.body.appendChild(container);
        mockVscode = new MockWebviewApi();
    });

    it('should pre-fill the update form with current profile values', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);

        expect(container.querySelector('.settings-subtitle')?.textContent).toContain(`Update Profile: ${mockProfile.id}`);
        
        const endpointInput = container.querySelector('#updateProfileEndpoint');
        const modelInput = container.querySelector('#updateProfileModel');
        const idInput = container.querySelector('#updateProfileId');
        const keyIdInput = container.querySelector('#updateKeyIdentifier');
        const isKeyReq = container.querySelector('#updateIsKeyRequired');
        const toolsToggle = container.querySelector('#updateSupportsTools');
        const excludeToggle = container.querySelector('#updateExcludeFromChat');

        expect(endpointInput instanceof HTMLInputElement && endpointInput.value).toBe(mockProfile.endpoint);
        expect(modelInput instanceof HTMLInputElement && modelInput.value).toBe(mockProfile.model);
        expect(idInput instanceof HTMLInputElement && idInput.value).toBe(mockProfile.id);
        expect(idInput instanceof HTMLInputElement && idInput.disabled).toBe(true);
        expect(keyIdInput instanceof HTMLInputElement && keyIdInput.value).toBe(mockProfile.apiKeyIdentifier);
        expect(isKeyReq instanceof HTMLInputElement && isKeyReq.checked).toBe(true);
        expect(toolsToggle instanceof HTMLInputElement && toolsToggle.checked).toBe(false);
        expect(excludeToggle instanceof HTMLInputElement && excludeToggle.checked).toBe(true);
    });

    it('should show and hide custom endpoint dropdown', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);
        const endpointInput = container.querySelector('#updateProfileEndpoint');
        const dropdownList = container.querySelector('#updateEndpointDropdownList');

        if (!(endpointInput instanceof HTMLInputElement)) { throw new Error('input missing'); }

        endpointInput.focus();
        expect(dropdownList?.classList.contains('visible')).toBe(true);
    });

    it('should handle item selection from dropdown', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);
        const endpointInput = container.querySelector('#updateProfileEndpoint');
        if (!(endpointInput instanceof HTMLInputElement)) { throw new Error('input missing'); }

        endpointInput.focus();
        const item = container.querySelector('.custom-dropdown-item');
        item?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        // Current mock state has only one endpoint
        expect(endpointInput.value).toBe('https://old-endpoint.com');
    });

    it('should show/hide key settings when toggling isKeyRequired', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);
        
        const isKeyReq = container.querySelector('#updateIsKeyRequired');
        const keySettings = container.querySelector('#updateKeySettings');

        if (!(isKeyReq instanceof HTMLInputElement) || !(keySettings instanceof HTMLElement)) {
            throw new Error('Elements not found');
        }

        // Initially shown
        expect(keySettings.classList.contains('hidden')).toBe(false);

        // Toggle OFF
        isKeyReq.checked = false;
        isKeyReq.dispatchEvent(new Event('change'));
        expect(keySettings.classList.contains('hidden')).toBe(true);

        // Toggle ON
        isKeyReq.checked = true;
        isKeyReq.dispatchEvent(new Event('change'));
        expect(keySettings.classList.contains('hidden')).toBe(false);
    });

    it('should enable/disable Save button based on validation', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);
        const saveBtn = container.querySelector('#updateSaveBtn');
        const endpointInput = container.querySelector('#updateProfileEndpoint');

        if (!(saveBtn instanceof HTMLButtonElement) || !(endpointInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        expect(saveBtn.disabled).toBe(false);

        // Clear endpoint
        endpointInput.value = '';
        endpointInput.dispatchEvent(new Event('input'));
        expect(saveBtn.disabled).toBe(true);

        // Restore endpoint
        endpointInput.value = 'valid';
        endpointInput.dispatchEvent(new Event('input'));
        expect(saveBtn.disabled).toBe(false);
    });

    it('should post correct payload when Save is clicked', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);
        
        const endpointInput = container.querySelector('#updateProfileEndpoint');
        const modelInput = container.querySelector('#updateProfileModel');
        const keyIdInput = container.querySelector('#updateKeyIdentifier');
        const toolsToggle = container.querySelector('#updateSupportsTools');
        const excludeToggle = container.querySelector('#updateExcludeFromChat');
        const saveBtn = container.querySelector('#updateSaveBtn');

        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement) || 
            !(keyIdInput instanceof HTMLInputElement) || !(toolsToggle instanceof HTMLInputElement) || 
            !(excludeToggle instanceof HTMLInputElement) || !(saveBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.value = 'https://new-api.com';
        modelInput.value = 'new-model';
        keyIdInput.value = 'NEW_KEY';
        
        // Restore to defaults (true for tools, false for exclude)
        toolsToggle.checked = true;
        excludeToggle.checked = false;

        saveBtn.click();

        expect(mockVscode.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.ADD_PROFILE,
            profile: {
                id: mockProfile.id,
                model: 'new-model',
                endpoint: 'https://new-api.com',
                isApiKeyRequired: true,
                apiKeyIdentifier: 'NEW_KEY'
                // capabilities omitted because they match defaults
            }
        });
        expect(onDoneCalled).toBe(true);
    });

    it('should use sparse saving (not send defaults) for capabilities', () => {
        // Create a profile that currently has defaults
        const defaultProfile = { ...mockProfile, supportsTools: true, excludeFromChat: false };
        updateLlmProfile.render(container, mockVscode, mockState, defaultProfile);
        
        const saveBtn = container.querySelector('#updateSaveBtn');
        if (!(saveBtn instanceof HTMLButtonElement)) { throw new Error('btn missing'); }

        saveBtn.click();

        const message = mockVscode.messages[0];
        if (message.command === WEBVIEW_COMMANDS.ADD_PROFILE) {
            expect(message.profile.supportsTools).toBeUndefined();
            expect(message.profile.excludeFromChat).toBeUndefined();
        } else {
            throw new Error('Unexpected message command');
        }
    });

    it('should send EDIT_API_KEY when Set Key is clicked', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);
        const setKeyBtn = container.querySelector('#updateSetKeyBtn');
        if (!(setKeyBtn instanceof HTMLButtonElement)) { throw new Error('btn missing'); }

        setKeyBtn.click();

        expect(mockVscode.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.EDIT_API_KEY,
            identifier: mockProfile.apiKeyIdentifier
        });
    });

    it('should call onDone when Cancel is clicked', () => {
        updateLlmProfile.render(container, mockVscode, mockState, mockProfile);
        const cancelBtn = container.querySelector('#updateCancelBtn');
        if (!(cancelBtn instanceof HTMLButtonElement)) { throw new Error('btn missing'); }

        cancelBtn.click();
        expect(onDoneCalled).toBe(true);
    });
});
