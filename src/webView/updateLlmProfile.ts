import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi, ProfileMetadata, InitialState } from '../types.js';
import { CustomDropdown } from './webViewUtils.js';

/**
 * Manages the advanced LLM Profile Update form UI.
 */
export class UpdateLlmProfile {
    private onDone: () => void;

    // Element Caching
    private _idInput?: HTMLInputElement;
    private _modelInput?: HTMLInputElement;
    private _endpointInput?: HTMLInputElement;
    
    private _isKeyRequiredToggle?: HTMLInputElement;
    private _keyIdentifierInput?: HTMLInputElement;
    private _setKeyBtn?: HTMLButtonElement;

    private _supportsToolsToggle?: HTMLInputElement;
    private _excludeFromChatToggle?: HTMLInputElement;

    private _saveBtn?: HTMLButtonElement;
    private _cancelBtn?: HTMLButtonElement;
    private _keyStatusIndicator?: HTMLElement;

    // Component State
    private _state?: InitialState;
    private _existingEndpoints: string[] = [];

    constructor(onDone: () => void) {
        this.onDone = onDone;
    }

    /**
     * Resets the component state.
     */
    public reset() {}

    /**
     * Refreshes the component with new state without re-rendering the whole DOM.
     */
    public refresh(state: InitialState) {
        this._state = state;
        this.updateKeyStatus();
    }

    /**
     * Renders the update form.
     * @param container Element to render into
     * @param vscode Webview API
     * @param state Current initial state
     * @param profile The profile to update
     */
    public render(container: HTMLElement, vscode: IWebviewApi, state: InitialState, profile: ProfileMetadata) {
        this._state = state;
        
        // Setup suggestions
        this._existingEndpoints = Array.from(new Set(
            (state.profileMetadata || []).map(p => p.endpoint).filter(e => !!e)
        ));

        container.innerHTML = '';
        const form = document.createElement('div');
        form.className = 'edit-profile-form';
        form.innerHTML = this.getTemplate(profile);
        container.appendChild(form);

        if (!this.bindElements(form)) {
            console.error('UpdateLlmProfile: Failed to bind UI elements.');
            return;
        }

        // 4. Initialize Shared Dropdown
        new CustomDropdown(
            this._endpointInput!,
            form.querySelector('#updateEndpointDropdownList')!,
            form.querySelector('.dropdown-input-wrapper')!,
            this._existingEndpoints,
            () => {
                this.updateKeyStatus();
            },
            () => {
                this.updateKeyStatus();
            },
            '+ New Provider URL...'
        );

        this.attachListeners(vscode);
        this.updateKeyStatus();
    }

    private getTemplate(profile: ProfileMetadata): string {
        return `
            <h3 class="settings-subtitle">Update Profile: ${profile.id}</h3>
            
            <div class="input-group">
                <label class="settings-label">Endpoint URL</label>
                <div class="custom-dropdown-container" id="endpointDropdownContainer">
                    <div class="dropdown-input-wrapper">
                        <input type="text" id="updateProfileEndpoint" value="${profile.endpoint}" class="settings-input" autocomplete="off">
                        <span class="dropdown-chevron">▼</span>
                    </div>
                    <div id="updateEndpointDropdownList" class="custom-dropdown-list"></div>
                </div>
            </div>

            <div class="input-group">
                <label class="settings-label">Model Name</label>
                <input type="text" id="updateProfileModel" value="${profile.model}" class="settings-input">
            </div>

            <div class="input-group">
                <label class="settings-label">Profile ID</label>
                <input type="text" id="updateProfileId" value="${profile.id}" class="settings-input" disabled>
                <div class="settings-description">Unique identifier for this configuration (Read-only).</div>
            </div>

            <div class="settings-section-divider"></div>

            <div class="input-group">
                <label class="settings-label">Security & Authentication</label>
                
                <label class="checkbox-container">
                    <input type="checkbox" id="updateIsKeyRequired" ${profile.needsApiKey ? 'checked' : ''}>
                    <span class="checkbox-label">API Key is required for this profile</span>
                </label>

                <div id="updateKeySettings" style="margin-top: 10px; ${profile.needsApiKey ? '' : 'display: none;'}">
                    <label class="settings-label small">API Key Identifier</label>
                    <div class="dropdown-input-wrapper">
                        <input type="text" id="updateKeyIdentifier" value="${profile.apiKeyIdentifier || ''}" placeholder="e.g. MY_SERVICE_KEY" class="settings-input">
                        <div id="updateKeyStatusIndicator" class="status-indicator" style="margin: 0 10px;"></div>
                        <button id="updateSetKeyBtn" class="settings-done small">Set Key</button>
                    </div>
                    <div class="settings-description">The name of the secret/environment variable containing the key.</div>
                </div>
            </div>

            <div class="settings-section-divider"></div>

            <div class="input-group">
                <label class="settings-label">Capabilities & UI</label>
                
                <label class="checkbox-container">
                    <input type="checkbox" id="updateSupportsTools" ${profile.supportsTools ? 'checked' : ''}>
                    <span class="checkbox-label">Supports Tool Calling</span>
                </label>
                <div class="settings-description small">Enable if the model can use functions (Search, Terminal, etc.)</div>

                <label class="checkbox-container" style="margin-top: 10px;">
                    <input type="checkbox" id="updateExcludeFromChat" ${profile.excludeFromChat ? 'checked' : ''}>
                    <span class="checkbox-label">Exclude from Chat View</span>
                </label>
                <div class="settings-description small">Keep this model only for inline completions.</div>
            </div>

            <div class="form-actions-row">
                <button id="updateSaveBtn" class="settings-done">Save Changes</button>
                <button id="updateCancelBtn" class="settings-done secondary">Cancel</button>
            </div>
        `;
    }

    private bindElements(form: HTMLElement): boolean {
        const idInput = form.querySelector('#updateProfileId');
        const modelInput = form.querySelector('#updateProfileModel');
        const endpointInput = form.querySelector('#updateProfileEndpoint');
        const endpointDropdownList = form.querySelector('#updateEndpointDropdownList');
        const endpointDropdownWrapper = form.querySelector('.dropdown-input-wrapper');

        const isKeyRequiredToggle = form.querySelector('#updateIsKeyRequired');
        const keyIdentifierInput = form.querySelector('#updateKeyIdentifier');
        const setKeyBtn = form.querySelector('#updateSetKeyBtn');
        const supportsToolsToggle = form.querySelector('#updateSupportsTools');
        const excludeFromChatToggle = form.querySelector('#updateExcludeFromChat');
        const saveBtn = form.querySelector('#updateSaveBtn');
        const cancelBtn = form.querySelector('#updateCancelBtn');
        const keyStatusIndicator = form.querySelector('#updateKeyStatusIndicator');

        if (idInput instanceof HTMLInputElement &&
            modelInput instanceof HTMLInputElement &&
            endpointInput instanceof HTMLInputElement &&
            endpointDropdownList instanceof HTMLElement &&
            endpointDropdownWrapper instanceof HTMLElement &&
            isKeyRequiredToggle instanceof HTMLInputElement &&
            keyIdentifierInput instanceof HTMLInputElement &&
            setKeyBtn instanceof HTMLButtonElement &&
            supportsToolsToggle instanceof HTMLInputElement &&
            excludeFromChatToggle instanceof HTMLInputElement &&
            saveBtn instanceof HTMLButtonElement &&
            cancelBtn instanceof HTMLButtonElement &&
            keyStatusIndicator instanceof HTMLElement) {
            
            this._idInput = idInput;
            this._modelInput = modelInput;
            this._endpointInput = endpointInput;
            this._isKeyRequiredToggle = isKeyRequiredToggle;
            this._keyIdentifierInput = keyIdentifierInput;
            this._setKeyBtn = setKeyBtn;
            this._supportsToolsToggle = supportsToolsToggle;
            this._excludeFromChatToggle = excludeFromChatToggle;
            this._saveBtn = saveBtn;
            this._cancelBtn = cancelBtn;
            this._keyStatusIndicator = keyStatusIndicator;
            return true;
        }

        return false;
    }

    private attachListeners(vscode: IWebviewApi) {
        if (!this._isKeyRequiredToggle || !this._keyIdentifierInput || !this._setKeyBtn || 
            !this._saveBtn || !this._cancelBtn || !this._endpointInput || !this._modelInput) {
            return;
        }

        this._isKeyRequiredToggle.addEventListener('change', () => {
            const container = document.getElementById('updateKeySettings');
            if (container) {
                container.style.display = this._isKeyRequiredToggle!.checked ? 'block' : 'none';
            }
            this.updateKeyStatus();
        });

        this._keyIdentifierInput.addEventListener('input', () => this.updateKeyStatus());
        this._modelInput.addEventListener('input', () => this.updateKeyStatus());

        this._setKeyBtn.addEventListener('click', () => {
            const identifier = this._keyIdentifierInput!.value.trim();
            if (identifier) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.EDIT_API_KEY,
                    identifier: identifier
                });
            }
        });

        this._saveBtn.addEventListener('click', () => {
            const id = this._idInput!.value.trim();
            const model = this._modelInput!.value.trim();
            const endpoint = this._endpointInput!.value.trim();
            const isKeyRequired = this._isKeyRequiredToggle!.checked;
            const identifier = this._keyIdentifierInput!.value.trim();
            
            // Capabilities (Sparse saving)
            const supportsTools = this._supportsToolsToggle!.checked;
            const excludeFromChat = this._excludeFromChatToggle!.checked;

            const profilePayload: any = {
                id,
                model,
                endpoint,
                isApiKeyRequired: isKeyRequired
            };

            if (isKeyRequired && identifier) {
                profilePayload.apiKeyIdentifier = identifier;
            }

            // Only add capability overrides if they are NOT defaults
            if (!supportsTools) { profilePayload.supportsTools = false; }
            if (excludeFromChat) { profilePayload.excludeFromChat = true; }

            vscode.postMessage({
                command: WEBVIEW_COMMANDS.ADD_PROFILE,
                profile: profilePayload
            });
            this.onDone();
        });

        this._cancelBtn.addEventListener('click', () => this.onDone());
    }

    private updateKeyStatus() {
        if (!this._keyIdentifierInput || !this._keyStatusIndicator || !this._saveBtn || 
            !this._endpointInput || !this._modelInput || !this._isKeyRequiredToggle) {
            return;
        }

        const identifier = this._keyIdentifierInput.value.trim();
        const isKeyRequired = this._isKeyRequiredToggle.checked;
        const endpoint = this._endpointInput.value.trim();
        const model = this._modelInput.value.trim();

        // 1. Basic validation
        const isCoreComplete = !!(endpoint && model);
        const isAuthValid = !isKeyRequired || !!identifier;
        this._saveBtn.disabled = !(isCoreComplete && isAuthValid);

        // 2. Status Badge
        if (!isKeyRequired) {
            this._keyStatusIndicator.innerHTML = '';
            return;
        }

        if (!identifier) {
            this._keyStatusIndicator.innerHTML = '<span class="status-badge warning">❌ Missing ID</span>';
            return;
        }

        const existingWithKey = this._state?.profileMetadata?.find(p => p.apiKeyIdentifier === identifier && p.hasApiKey);
        if (existingWithKey) {
            this._keyStatusIndicator.innerHTML = '<span class="status-badge success">✅ Key Ready</span>';
        } else {
            this._keyStatusIndicator.innerHTML = '<span class="status-badge warning">❌ No Key Set</span>';
        }
    }
}
