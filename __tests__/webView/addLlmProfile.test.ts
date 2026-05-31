/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockWebviewApi } from '../testUtils.js';
import { WEBVIEW_COMMANDS } from '../../src/constants/protocol.js';
import { AddLlmProfile } from '../../src/webView/addLlmProfile.js';
import { InitialState } from '../../src/types.js';

describe('AddLlmProfile Unit Tests (Behavioral)', () => {
    let mockVscode: MockWebviewApi;
    let addLlmProfile: AddLlmProfile;
    let container: HTMLElement;
    let onDoneCalled = false;

    const mockState: InitialState = {
        profiles: ['ollama-devstral'],
        activeProfile: 'ollama-devstral',
        completionProfiles: ['ollama-devstral'],
        activeCompletionProfile: 'ollama-devstral',
        profileMetadata: [
            {
                id: 'ollama-devstral',
                model: 'devstral-2',
                endpoint: 'https://ollama.com/v1',
                needsApiKey: true,
                hasApiKey: true,
                apiKeyIdentifier: 'OLLAMA_API_KEY',
                origin: 'bundled',
                supportsTools: true,
                excludeFromChat: false,
                isActiveChat: true,
                isActiveCompletion: true
            }
        ]
    };

    beforeEach(() => {
        onDoneCalled = false;
        addLlmProfile = new AddLlmProfile(() => { onDoneCalled = true; });
        container = document.createElement('div');
        document.body.innerHTML = '';
        document.body.appendChild(container);
        mockVscode = new MockWebviewApi();
    });

    it('should render the "Add" form initially with disabled key section', () => {
        addLlmProfile.render(container, mockVscode, mockState);

        expect(container.querySelector('.settings-subtitle')?.textContent).toBe('Add Custom Profile');
        
        const keySection = container.querySelector('#keyCheckSection');
        expect(keySection?.classList.contains('section-disabled')).toBe(true);

        const idInput = container.querySelector('#editProfileId');
        const modelInput = container.querySelector('#editProfileModel');
        const endpointInput = container.querySelector('#editProfileEndpoint');

        expect(idInput instanceof HTMLInputElement && idInput.value).toBe('');
        expect(modelInput instanceof HTMLInputElement && modelInput.value).toBe('');
        expect(endpointInput instanceof HTMLInputElement && endpointInput.value).toBe('');
    });

    it('should auto-compute Profile ID as user types', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        const idInput = container.querySelector('#editProfileId');

        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement) || !(idInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        // 1. Type endpoint
        endpointInput.value = 'https://api.openai.com/v1';
        endpointInput.dispatchEvent(new Event('input'));
        expect(idInput.value).toBe('openai');

        // 2. Type model
        modelInput.value = 'gpt-4o';
        modelInput.dispatchEvent(new Event('input'));
        expect(idInput.value).toBe('openai-gpt-4o');
    });

    it('should stop auto-computing ID if user manually edits it', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const idInput = container.querySelector('#editProfileId');

        if (!(endpointInput instanceof HTMLInputElement) || !(idInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        // Manually edit ID
        idInput.value = 'my-custom-id';
        idInput.dispatchEvent(new Event('input'));

        // Change endpoint - ID should NOT change
        endpointInput.value = 'https://groq.com/v1';
        endpointInput.dispatchEvent(new Event('input'));
        expect(idInput.value).toBe('my-custom-id');
    });

    it('should enable key section and "Save" button when form is complete', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        const idInput = container.querySelector('#editProfileId');
        const keySection = container.querySelector('#keyCheckSection');
        const saveBtn = container.querySelector('#saveProfileBtn');

        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement) || !(idInput instanceof HTMLInputElement) || !(saveBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }

        expect(keySection?.classList.contains('section-disabled')).toBe(true);
        expect(saveBtn.disabled).toBe(true);
        // Verify CSS class exists for the :disabled pseudo-selector to work
        expect(saveBtn.classList.contains('settings-done')).toBe(true);

        endpointInput.value = 'https://api.openai.com/v1';
        endpointInput.dispatchEvent(new Event('input'));
        modelInput.value = 'gpt-4';
        modelInput.dispatchEvent(new Event('input'));

        // ID should be auto-filled, completing the form
        expect(idInput.value).not.toBe('');
        expect(keySection?.classList.contains('section-disabled')).toBe(false);
        expect(saveBtn.disabled).toBe(false);
    });

    it('should show "Key Ready" if provider already has an API key', () => {
        // Mock state has a key for OLLAMA_API_KEY
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        const statusIndicator = container.querySelector('#keyStatusIndicator');

        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.value = 'https://ollama.com/v1';
        endpointInput.dispatchEvent(new Event('input'));
        modelInput.value = 'test';
        modelInput.dispatchEvent(new Event('input'));

        expect(statusIndicator?.textContent).toContain('Key Ready');
    });

    it('should show custom dropdown with suggestions on focus', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const dropdownList = container.querySelector('#endpointDropdownList');

        if (!(endpointInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.focus();
        expect(dropdownList?.classList.contains('visible')).toBe(true);
        
        // Should contain existing endpoint and the "New" action
        const items = container.querySelectorAll('.custom-dropdown-item');
        expect(items.length).toBe(2); // 1 existing + 1 special action
        expect(items[0].textContent).toBe('https://ollama.com/v1');
        expect(items[1].textContent).toContain('New Provider URL');
    });

    it('should filter dropdown items based on input', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        if (!(endpointInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.value = 'something-else';
        endpointInput.dispatchEvent(new Event('input'));
        
        const items = container.querySelectorAll('.custom-dropdown-item');
        expect(items.length).toBe(1); // Only the "New Provider URL" action
    });

    it('should handle "New Provider URL" click by clearing input', () => {
        addLlmProfile.render(container, mockVscode, mockState);

        const endpointInput = container.querySelector('#editProfileEndpoint');
        if (!(endpointInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }
        endpointInput.value = 'pre-filled';

        // Dropdown must be shown to render the action
        endpointInput.focus();

        const newAction = container.querySelector('.new-endpoint-action');
        if (!newAction) { throw new Error('New action not found'); }

        // mousedown is used in logic to prevent focus loss
        newAction.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(endpointInput.value).toBe('');
    });

    it('should handle getBrandFromUrl logic for various hostnames', () => {
        // We can test this by checking auto-computed ID for different endpoints
        addLlmProfile.render(container, mockVscode, mockState);
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const idInput = container.querySelector('#editProfileId');

        if (!(endpointInput instanceof HTMLInputElement) || !(idInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        const testCases = [
            { url: 'http://localhost:11434', expected: 'local' },
            { url: 'https://api.openai.com/v1', expected: 'openai' },
            { url: 'https://mysub.mistral.ai', expected: 'mistral' },
            { url: 'https://some-weird-provider.co.uk', expected: 'some_weird_provider' },
            { url: 'https://just-one-part', expected: 'just_one_part' }, // Tests hostname without dots
            { url: 'not-a-url', expected: 'custom' }
        ];

        for (const tc of testCases) {
            endpointInput.value = tc.url;
            endpointInput.dispatchEvent(new Event('input'));
            expect(idInput.value).toBe(tc.expected);
        }
    });

    it('should show and hide dropdown correctly', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const dropdownList = container.querySelector('#endpointDropdownList');
        const dropdownWrapper = container.querySelector('.dropdown-input-wrapper');

        if (!(endpointInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.focus();
        expect(dropdownList?.classList.contains('visible')).toBe(true);
        expect(dropdownWrapper?.classList.contains('open')).toBe(true);
    });

    it('should handle item selection from dropdown', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const dropdownList = container.querySelector('#endpointDropdownList');
        
        if (!(endpointInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.focus();
        const item = container.querySelector('.custom-dropdown-item');
        item?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        
        expect(endpointInput.value).toBe('https://ollama.com/v1');
        expect(dropdownList?.classList.contains('visible')).toBe(false);
    });

    it('should post ADD_PROFILE message when Save is clicked', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        const saveBtn = container.querySelector('#saveProfileBtn');

        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement) || !(saveBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.value = 'https://api.groq.com';
        endpointInput.dispatchEvent(new Event('input'));
        modelInput.value = 'llama3';
        modelInput.dispatchEvent(new Event('input'));

        saveBtn.click();

        expect(mockVscode.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.ADD_PROFILE,
            profile: {
                id: 'groq-llama3',
                model: 'llama3',
                endpoint: 'https://api.groq.com',
                apiKeyIdentifier: 'GROQ_API_KEY',
                isApiKeyRequired: true
            }
        });
        expect(onDoneCalled).toBe(true);
    });

    it('should post ADD_PROFILE with isApiKeyRequired: false when "No Key Required" is clicked', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        const noKeyBtn = container.querySelector('#noKeyRequiredBtn');

        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement) || !(noKeyBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.value = 'http://localhost:11434';
        endpointInput.dispatchEvent(new Event('input'));
        modelInput.value = 'local-model';
        modelInput.dispatchEvent(new Event('input'));

        noKeyBtn.click();

        expect(mockVscode.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.ADD_PROFILE,
            profile: {
                id: 'local-local-model',
                model: 'local-model',
                endpoint: 'http://localhost:11434',
                isApiKeyRequired: false
            }
        });
        expect(onDoneCalled).toBe(true);
    });

    it('should open security settings when "Set API Key" is clicked', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        // Fill form to enable section
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.value = 'x';
        endpointInput.dispatchEvent(new Event('input'));
        modelInput.value = 'y';
        modelInput.dispatchEvent(new Event('input'));

        const setKeyFlowBtn = container.querySelector('#setKeyFlowBtn');
        const keyCheckSection = container.querySelector('#keyCheckSection');
        const keySettingsSection = container.querySelector('#keySettingsSection');

        if (!(setKeyFlowBtn instanceof HTMLButtonElement) || !(keyCheckSection instanceof HTMLElement) || !(keySettingsSection instanceof HTMLElement)) {
            throw new Error('Elements not found');
        }

        setKeyFlowBtn.click();

        expect(keyCheckSection.classList.contains('hidden')).toBe(true);
        expect(keySettingsSection.classList.contains('hidden')).toBe(false);
    });

    it('should send EDIT_API_KEY message from key settings section', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        // Fill form
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }
        endpointInput.value = 'https://api.openai.com/v1';
        endpointInput.dispatchEvent(new Event('input'));
        modelInput.value = 'gpt-4';
        modelInput.dispatchEvent(new Event('input'));

        const setKeyFlowBtn = container.querySelector('#setKeyFlowBtn');
        if (!(setKeyFlowBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }
        setKeyFlowBtn.click();

        const setKeyFinalBtn = container.querySelector('#setKeyFinalBtn');
        if (!(setKeyFinalBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }
        setKeyFinalBtn.click();

        expect(mockVscode.messages).toContainEqual({
            command: WEBVIEW_COMMANDS.EDIT_API_KEY,
            identifier: 'OPENAI_API_KEY'
        });
    });

    it('should return from security settings section via Back button', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const setKeyFlowBtn = container.querySelector('#setKeyFlowBtn');
        if (!(setKeyFlowBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }
        setKeyFlowBtn.click();

        const backBtn = container.querySelector('#cancelKeySettingsBtn');
        const keyCheckSection = container.querySelector('#keyCheckSection');
        const keySettingsSection = container.querySelector('#keySettingsSection');

        if (!(backBtn instanceof HTMLButtonElement) || !(keyCheckSection instanceof HTMLElement) || !(keySettingsSection instanceof HTMLElement)) {
            throw new Error('Elements not found');
        }

        backBtn.click();

        expect(keyCheckSection.classList.contains('hidden')).toBe(false);
        expect(keySettingsSection.classList.contains('hidden')).toBe(true);
    });

    it('should call onDone when main Cancel is clicked', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        const cancelBtn = container.querySelector('#cancelEditBtn');
        if (!(cancelBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }
        cancelBtn.click();
        expect(onDoneCalled).toBe(true);
    });

    it('should show "No Key Set" if provider does not have an API key', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const modelInput = container.querySelector('#editProfileModel');
        const statusIndicator = container.querySelector('#keyStatusIndicator');

        if (!(endpointInput instanceof HTMLInputElement) || !(modelInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        // This provider is not in mockState.profileMetadata
        endpointInput.value = 'https://new-provider.com';
        endpointInput.dispatchEvent(new Event('input'));
        modelInput.value = 'test';
        modelInput.dispatchEvent(new Event('input'));

        expect(statusIndicator?.textContent).toContain('No Key Set');
    });

    it('should block saving and show error if Profile ID is already taken', () => {
        addLlmProfile.render(container, mockVscode, mockState);
        
        const idInput = container.querySelector('#editProfileId');
        const validationMsg = container.querySelector('#idValidationMessage');
        const saveBtn = container.querySelector('#saveProfileBtn');

        if (!(idInput instanceof HTMLInputElement) || !(validationMsg instanceof HTMLElement) || !(saveBtn instanceof HTMLButtonElement)) {
            throw new Error('Elements not found');
        }

        // 1. Manually type a taken ID ('ollama-devstral' exists in mockState)
        idInput.value = 'ollama-devstral';
        idInput.dispatchEvent(new Event('input'));

        expect(validationMsg.textContent).toContain('already taken');
        expect(validationMsg.classList.contains('validation-error')).toBe(true);
        expect(saveBtn.disabled).toBe(true);

        // 2. Clear ID - should still be disabled but show original message
        idInput.value = '';
        idInput.dispatchEvent(new Event('input'));
        expect(validationMsg.textContent).toContain('Unique identifier');
        expect(saveBtn.disabled).toBe(true);

        // 3. Type unique ID
        idInput.value = 'brand-new-id';
        idInput.dispatchEvent(new Event('input'));
        expect(validationMsg.textContent).toContain('available');
        expect(validationMsg.classList.contains('validation-success')).toBe(true);
        // (Note: saveBtn might still be disabled if other fields are empty, 
        // which is expected behavior for a partial form)
    });

    it('should hide dropdown on blur', (done) => {
        addLlmProfile.render(container, mockVscode, mockState);
        const endpointInput = container.querySelector('#editProfileEndpoint');
        const dropdownList = container.querySelector('#endpointDropdownList');

        if (!(endpointInput instanceof HTMLInputElement)) {
            throw new Error('Elements not found');
        }

        endpointInput.focus();
        expect(dropdownList?.classList.contains('visible')).toBe(true);

        endpointInput.blur();
        
        // Wait for setTimeout in blur handler
        setTimeout(() => {
            expect(dropdownList?.classList.contains('visible')).toBe(false);
            done();
        }, 300);
    });
});
