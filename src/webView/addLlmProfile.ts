import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi, InitialState } from '../types.js';
import { getBrandFromUrl, CustomDropdown } from './webViewUtils.js';

/**
 * Manages the LLM Profile Edit/Add form UI.
 */
export class AddLlmProfile {
    private onDone: () => void;

    // Element Caching
    private _idInput?: HTMLInputElement;
    private _modelInput?: HTMLInputElement;
    private _endpointInput?: HTMLInputElement;
    private _idValidationMessage?: HTMLElement;

    private _keyCheckSection?: HTMLElement;
    private _keySettingsSection?: HTMLElement;

    private _keyTypeShared?: HTMLInputElement;
    private _keyTypeUnique?: HTMLInputElement;
    private _previewShared?: HTMLElement;
    private _previewUnique?: HTMLElement;

    private _setKeyFlowBtn?: HTMLButtonElement;
    private _noKeyRequiredBtn?: HTMLButtonElement;
    private _setKeyFinalBtn?: HTMLButtonElement;
    private _cancelKeySettingsBtn?: HTMLButtonElement;

    private _saveBtn?: HTMLButtonElement;
    private _cancelBtn?: HTMLButtonElement;
    private _keyStatusIndicator?: HTMLElement;

    // Component State
    private _isIdManuallyEdited: boolean = false;
    private _existingEndpoints: string[] = [];
    private _state?: InitialState;

    constructor(onDone: () => void) {
        this.onDone = onDone;
    }

    /**
     * Resets the form state.
     */
    public reset() {
        this._isIdManuallyEdited = false;
    }

    /**
     * Refreshes the component with new state without re-rendering the whole DOM.
     * Useful for updating key status badges after a background secret change.
     */
    public refresh(state: InitialState) {
        this._state = state;
        this.updateFormState();
    }

    /**
     * Renders the form.
     * @param container Element to render into
     * @param vscode Webview API
     * @param state Current initial state for context-aware suggestions
     */
    public render(container: HTMLElement, vscode: IWebviewApi, state: InitialState) {
        const title = 'Add Custom Profile';
        this._state = state;
        this._isIdManuallyEdited = false;

        // 1. Setup Data
        this._existingEndpoints = Array.from(new Set(
            (state.profileMetadata || []).map(p => p.endpoint).filter(e => !!e)
        ));

        // 2. Initial DOM Setup
        container.innerHTML = '';
        const form = document.createElement('div');
        form.className = 'edit-profile-form';
        form.innerHTML = this.getTemplate(title);
        container.appendChild(form);

        // 3. Binding & Type Safety
        if (!this.bindElements(form)) {
            console.error('AddLlmProfile: Failed to bind UI elements.');
            return;
        }

        // 4. Initialize Shared Dropdown
        new CustomDropdown(
            this._endpointInput!,
            form.querySelector('#endpointDropdownList')!,
            form.querySelector('.dropdown-input-wrapper')!,
            this._existingEndpoints,
            () => {
                this.computeSuggestedId();
                this.updateFormState();
            },
            () => {
                this.computeSuggestedId();
                this.updateFormState();
            },
            '+ New Provider URL...'
        );

        // 5. Attach Listeners & Initial State
        this.attachListeners(vscode);
        this.updateFormState();
    }

    private getTemplate(title: string): string {
        return `
            <h3 class="settings-subtitle">${title}</h3>
            
            <div class="input-group">
                <label class="settings-label">Endpoint URL</label>
                <div class="custom-dropdown-container" id="endpointDropdownContainer">
                    <div class="dropdown-input-wrapper">
                        <input type="text" id="editProfileEndpoint" value="" placeholder="e.g. https://api.openai.com/v1" class="settings-input" autocomplete="off">
                        <span class="dropdown-chevron">▼</span>
                    </div>
                    <div id="endpointDropdownList" class="custom-dropdown-list"></div>
                </div>
            </div>

            <div class="input-group">
                <label class="settings-label">Model Name</label>
                <input type="text" id="editProfileModel" value="" placeholder="e.g. gpt-4" class="settings-input">
            </div>

            <div class="input-group">
                <label class="settings-label">Profile ID (display name)</label>
                <input type="text" id="editProfileId" value="" placeholder="e.g. my-provider-model" class="settings-input">
                <div id="idValidationMessage" class="settings-description mt-4">Unique identifier for this configuration.</div>
            </div>

            <div class="settings-section-divider"></div>

            <div id="keyCheckSection" class="key-status-container section-disabled">
                <label class="settings-label">API Key Configuration</label>
                <div id="keyCheckRow" class="key-status-row">
                    <div id="keyStatusIndicator" class="status-indicator"></div>
                    <div id="keyActionButtons" class="key-action-buttons">
                        <button id="setKeyFlowBtn" class="settings-done small">Set API Key</button>
                        <button id="noKeyRequiredBtn" class="settings-done small secondary">No Key Required</button>
                    </div>
                </div>
            </div>

            <div id="keySettingsSection" class="input-group hidden">
                <label class="settings-label">API Key Security</label>
                <div class="settings-description">Choose how to link the API Key.</div>
                
                <div class="key-options-group">
                    <label class="key-option" for="keyTypeShared">
                        <input type="radio" name="keyType" id="keyTypeShared" value="shared" checked>
                        <div class="key-option-content">
                            <span class="key-option-title">Shared Provider Key <span class="recommendation-tag">(Recommended)</span></span>
                            <span class="key-option-description">Authorizes all models from this provider with a single key.</span>
                            <span id="previewShared" class="key-option-preview">---</span>
                        </div>
                    </label>

                    <label class="key-option" for="keyTypeUnique">
                        <input type="radio" name="keyType" id="keyTypeUnique" value="unique">
                        <div class="key-option-content">
                            <span class="key-option-title">Dedicated Model Key</span>
                            <span class="key-option-description">Useful for specific accounts or isolated per-model testing.</span>
                            <span id="previewUnique" class="key-option-preview">---</span>
                        </div>
                    </label>
                </div>
                <div class="key-status-row mt-10">
                    <button id="setKeyFinalBtn" class="settings-done small">Confirm Key</button>
                    <button id="cancelKeySettingsBtn" class="settings-done small secondary">Back</button>
                </div>
            </div>

            <div class="form-actions-row">
                <button id="saveProfileBtn" class="settings-done">Save Profile</button>
                <button id="cancelEditBtn" class="settings-done secondary">Cancel</button>
            </div>
        `;
    }

    private bindElements(form: HTMLElement): boolean {
        const idInput = form.querySelector('#editProfileId');
        const idValidationMessage = form.querySelector('#idValidationMessage');
        const modelInput = form.querySelector('#editProfileModel');
        const endpointInput = form.querySelector('#editProfileEndpoint');
        const keyCheckSection = form.querySelector('#keyCheckSection');
        const keySettingsSection = form.querySelector('#keySettingsSection');
        const keyTypeShared = form.querySelector('#keyTypeShared');
        const keyTypeUnique = form.querySelector('#keyTypeUnique');
        const previewShared = form.querySelector('#previewShared');
        const previewUnique = form.querySelector('#previewUnique');
        const setKeyFlowBtn = form.querySelector('#setKeyFlowBtn');
        const noKeyRequiredBtn = form.querySelector('#noKeyRequiredBtn');
        const setKeyFinalBtn = form.querySelector('#setKeyFinalBtn');
        const cancelKeySettingsBtn = form.querySelector('#cancelKeySettingsBtn');
        const saveBtn = form.querySelector('#saveProfileBtn');
        const cancelBtn = form.querySelector('#cancelEditBtn');
        const keyStatusIndicator = form.querySelector('#keyStatusIndicator');

        if (idInput instanceof HTMLInputElement &&
            idValidationMessage instanceof HTMLElement &&
            modelInput instanceof HTMLInputElement &&
            endpointInput instanceof HTMLInputElement &&
            keyCheckSection instanceof HTMLElement &&
            keySettingsSection instanceof HTMLElement &&
            keyTypeShared instanceof HTMLInputElement &&
            keyTypeUnique instanceof HTMLInputElement &&
            previewShared instanceof HTMLElement &&
            previewUnique instanceof HTMLElement &&
            setKeyFlowBtn instanceof HTMLButtonElement &&
            noKeyRequiredBtn instanceof HTMLButtonElement &&
            setKeyFinalBtn instanceof HTMLButtonElement &&
            cancelKeySettingsBtn instanceof HTMLButtonElement &&
            saveBtn instanceof HTMLButtonElement &&
            cancelBtn instanceof HTMLButtonElement &&
            keyStatusIndicator instanceof HTMLElement) {
            
            this._idInput = idInput;
            this._idValidationMessage = idValidationMessage;
            this._modelInput = modelInput;
            this._endpointInput = endpointInput;
            this._keyCheckSection = keyCheckSection;
            this._keySettingsSection = keySettingsSection;
            this._keyTypeShared = keyTypeShared;
            this._keyTypeUnique = keyTypeUnique;
            this._previewShared = previewShared;
            this._previewUnique = previewUnique;
            this._setKeyFlowBtn = setKeyFlowBtn;
            this._noKeyRequiredBtn = noKeyRequiredBtn;
            this._setKeyFinalBtn = setKeyFinalBtn;
            this._cancelKeySettingsBtn = cancelKeySettingsBtn;
            this._saveBtn = saveBtn;
            this._cancelBtn = cancelBtn;
            this._keyStatusIndicator = keyStatusIndicator;
            return true;
        }

        return false;
    }

    private attachListeners(vscode: IWebviewApi) {
        if (!this._endpointInput || !this._modelInput || !this._idInput || !this._keyTypeShared || 
            !this._keyTypeUnique || !this._setKeyFlowBtn || !this._cancelKeySettingsBtn || 
            !this._setKeyFinalBtn || !this._noKeyRequiredBtn || !this._saveBtn || !this._cancelBtn) {
            return;
        }

        this._modelInput.addEventListener('input', () => {
            this.computeSuggestedId();
            this.updateFormState();
        });

        this._idInput.addEventListener('input', () => {
            this._isIdManuallyEdited = true;
            this.updateFormState();
        });

        this._keyTypeShared.addEventListener('change', () => this.updateFormState());
        this._keyTypeUnique.addEventListener('change', () => this.updateFormState());

        this._setKeyFlowBtn.addEventListener('click', () => {
            this._keyCheckSection!.classList.add('hidden');
            this._keySettingsSection!.classList.remove('hidden');
        });

        this._cancelKeySettingsBtn.addEventListener('click', () => {
            this._keySettingsSection!.classList.add('hidden');
            this._keyCheckSection!.classList.remove('hidden');
        });

        this._setKeyFinalBtn.addEventListener('click', () => {
            const identifier = this.getCurrentIdentifier();
            if (identifier) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.EDIT_API_KEY,
                    identifier: identifier
                });
            }
        });

        this._noKeyRequiredBtn.addEventListener('click', () => {
            const id = this._idInput!.value.trim();
            const model = this._modelInput!.value.trim();
            const endpoint = this._endpointInput!.value.trim();

            if (id && model && endpoint) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.ADD_PROFILE,
                    profile: { id, model, endpoint, isApiKeyRequired: false }
                });
                this.onDone();
            }
        });

        this._saveBtn.addEventListener('click', () => {
            const id = this._idInput!.value.trim();
            const model = this._modelInput!.value.trim();
            const endpoint = this._endpointInput!.value.trim();
            const identifier = this.getCurrentIdentifier();

            if (id && model && endpoint && identifier) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.ADD_PROFILE,
                    profile: { id, model, endpoint, apiKeyIdentifier: identifier, isApiKeyRequired: true }
                });
                this.onDone();
            }
        });

        this._cancelBtn.addEventListener('click', () => this.onDone());
    }

    private computeSuggestedId() {
        if (this._isIdManuallyEdited || !this._idInput || !this._endpointInput || !this._modelInput) { return; }
        
        const endpoint = this._endpointInput.value.trim();
        const model = this._modelInput.value.trim();
        
        if (!endpoint && !model) {
            this._idInput.value = '';
            return;
        }

        const brand = getBrandFromUrl(endpoint).toLowerCase();
        const cleanModel = model.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        if (brand && cleanModel) {
            this._idInput.value = `${brand}-${cleanModel}`;
        } else if (brand) {
            this._idInput.value = brand;
        } else if (cleanModel) {
            this._idInput.value = cleanModel;
        }
    }

    private getCurrentIdentifier(): string {
        if (!this._keyTypeShared || !this._endpointInput || !this._idInput) { return ''; }

        const isShared = this._keyTypeShared.checked;
        const brand = getBrandFromUrl(this._endpointInput.value.trim());
        const id = this._idInput.value.trim();
        
        if (isShared) {
            return brand ? `${brand}_API_KEY` : '';
        } else {
            return id ? `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY` : '';
        }
    }

    /**
     * Checks if the current ID is unique and updates the validation message.
     * @returns true if the ID is unique, false otherwise.
     */
    private validateIdUniqueness(): boolean {
        if (!this._idInput || !this._idValidationMessage) { return true; }

        const currentId = this._idInput.value.trim();
        if (!currentId) {
            this._idValidationMessage.textContent = 'Unique identifier for this configuration.';
            this._idValidationMessage.classList.remove('validation-error', 'validation-success');
            return false; // Not "taken", but not complete either
        }

        const existingProfile = this._state?.profileMetadata?.find(p => p.id === currentId);

        if (existingProfile) {
            this._idValidationMessage.textContent = `Error: ID "${currentId}" is already taken. Please choose a unique name.`;
            this._idValidationMessage.classList.add('validation-error');
            this._idValidationMessage.classList.remove('validation-success');
            return false;
        }

        // Success state
        this._idValidationMessage.textContent = 'ID is available.';
        this._idValidationMessage.classList.add('validation-success');
        this._idValidationMessage.classList.remove('validation-error');
        return true;
    }

    private updateFormState() {
        if (!this._endpointInput || !this._modelInput || !this._idInput || 
            !this._keyCheckSection || !this._previewShared || !this._previewUnique || 
            !this._keyStatusIndicator || !this._setKeyFlowBtn || !this._noKeyRequiredBtn || !this._saveBtn) {
            return;
        }

        const endpoint = this._endpointInput.value.trim();
        const model = this._modelInput.value.trim();
        const id = this._idInput.value.trim();
        const isCoreComplete = !!(endpoint && model && id);
        
        // 1. Uniqueness Validation
        const isIdUnique = this.validateIdUniqueness();

        // 2. Main Validator
        const isFormComplete = isCoreComplete && isIdUnique;

        this._keyCheckSection.classList.toggle('section-disabled', !isFormComplete);

        const currentIdentifier = this.getCurrentIdentifier();
        const brand = getBrandFromUrl(endpoint);
        this._previewShared.textContent = brand ? `${brand}_API_KEY` : '---';
        this._previewUnique.textContent = id ? `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY` : '---';

        const existingWithKey = this._state?.profileMetadata?.find(p => p.apiKeyIdentifier === currentIdentifier && p.hasApiKey);
        const hasKey = !!existingWithKey;

        if (hasKey) {
            this._keyStatusIndicator.innerHTML = '<span class="status-badge success">✅ Key Ready</span>';
            this._setKeyFlowBtn.classList.add('hidden');
            this._noKeyRequiredBtn.classList.add('hidden');
        } else {
            this._keyStatusIndicator.innerHTML = '<span class="status-badge warning">❌ No Key Set</span>';
            this._setKeyFlowBtn.classList.remove('hidden');
            this._noKeyRequiredBtn.classList.remove('hidden');
        }

        this._setKeyFlowBtn.disabled = !isFormComplete;
        this._noKeyRequiredBtn.disabled = !isFormComplete;
        this._saveBtn.disabled = !isFormComplete;
    }
}
