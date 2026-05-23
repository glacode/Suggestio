import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi, ProfileMetadata, InitialState } from '../types.js';

/**
 * Common LLM providers mapping for consistent brand naming.
 */
const KNOWN_PROVIDERS: Record<string, string> = {
    'openai.com': 'OPENAI',
    'anthropic.com': 'ANTHROPIC',
    'groq.com': 'GROQ',
    'mistral.ai': 'MISTRAL',
    'openrouter.ai': 'OPENROUTER',
    'huggingface.co': 'HUGGINGFACE',
    'together.xyz': 'TOGETHER',
    'deepseek.com': 'DEEPSEEK',
    'googleapis.com': 'GOOGLEAPIS',
    'ollama.com': 'OLLAMA'
};

/**
 * Manages the LLM Profile Edit/Add form UI.
 */
export class EditLlmProfile {
    private onDone: () => void;

    constructor(onDone: () => void) {
        this.onDone = onDone;
    }

    /**
     * Extracts a brand name from a URL for API key placeholder generation.
     */
    private getBrandFromUrl(url: string): string {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase();

            // 1. Special Cases
            if (host === 'localhost' || host === '127.0.0.1') {
                return 'LOCAL';
            }

            // 2. Known Providers Map (exact or suffix match)
            for (const [domain, brand] of Object.entries(KNOWN_PROVIDERS)) {
                if (host === domain || host.endsWith('.' + domain)) {
                    return brand;
                }
            }

            // 3. Common Multi-part TLDs
            const multiPartTlds = ['.co.uk', '.com.br', '.org.uk', '.net.au', '.gov.it', '.co.jp'];
            
            let workingHost = host;
            for (const tld of multiPartTlds) {
                if (host.endsWith(tld)) {
                    workingHost = host.slice(0, -tld.length);
                    break;
                }
            }

            // 4. Standard TLD stripping if no multi-part match
            if (workingHost === host) {
                const parts = host.split('.');
                if (parts.length > 1) {
                    workingHost = parts.slice(0, -1).join('.');
                }
            }

            // 5. Take last segment
            const finalParts = workingHost.split('.');
            const brand = finalParts[finalParts.length - 1];
            
            return brand.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        } catch {
            return 'CUSTOM';
        }
    }

    public render(container: HTMLElement, vscode: IWebviewApi, state: InitialState, profile: ProfileMetadata | null = null) {
        container.innerHTML = '';

        const isEdit = !!profile;
        const title = isEdit ? `Edit Profile: ${profile.id}` : 'Add Custom Profile';

        // Extract unique endpoints for suggestions
        const existingEndpoints = Array.from(new Set(
            (state.profileMetadata || []).map(p => p.endpoint).filter(e => !!e)
        ));

        const form = document.createElement('div');
        form.className = 'edit-profile-form';
        form.innerHTML = `
            <h3 class="settings-subtitle">${title}</h3>
            
            <div class="input-group">
                <label class="settings-label">Endpoint URL</label>
                <div class="custom-dropdown-container" id="endpointDropdownContainer">
                    <div class="dropdown-input-wrapper">
                        <input type="text" id="editProfileEndpoint" value="${profile?.endpoint || ''}" placeholder="e.g. https://api.openai.com/v1" class="settings-input" autocomplete="off">
                        <span class="dropdown-chevron">▼</span>
                    </div>
                    <div id="endpointDropdownList" class="custom-dropdown-list">
                        <!-- Items injected via JS -->
                    </div>
                </div>
            </div>

            <div class="input-group">
                <label class="settings-label">Model Name</label>
                <input type="text" id="editProfileModel" value="${profile?.model || ''}" placeholder="e.g. gpt-4" class="settings-input">
            </div>

            <div class="input-group">
                <label class="settings-label">Profile ID (display name)</label>
                <input type="text" id="editProfileId" value="${profile?.id || ''}" placeholder="e.g. my-provider-model" class="settings-input" ${isEdit ? 'disabled' : ''}>
                <div class="settings-description">Unique identifier for this configuration.</div>
            </div>

            <div class="settings-section-divider"></div>

            <div id="keyCheckSection" class="key-status-container section-disabled">
                <label class="settings-label">API Key Configuration</label>
                <div id="keyCheckRow" class="key-status-row">
                    <div id="keyStatusIndicator" class="status-indicator">
                        <!-- Dynamic Status -->
                    </div>
                    <div id="keyActionButtons" class="key-action-buttons">
                        <button id="setKeyFlowBtn" class="settings-done small">Set API Key</button>
                        <button id="noKeyRequiredBtn" class="settings-done small secondary">No Key Required</button>
                    </div>
                </div>
            </div>

            <div id="keySettingsSection" class="input-group" style="display: none;">
                <label class="settings-label">API Key Security</label>
                <div class="settings-description">Choose how to link the API Key.</div>
                
                <div class="key-options-group">
                    <label class="key-option" for="keyTypeShared">
                        <input type="radio" name="keyType" id="keyTypeShared" value="shared" checked>
                        <div class="key-option-content">
                            <span class="key-option-title">Shared Provider Key</span>
                            <span id="previewShared" class="key-option-preview">---</span>
                        </div>
                    </label>

                    <label class="key-option" for="keyTypeUnique">
                        <input type="radio" name="keyType" id="keyTypeUnique" value="unique">
                        <div class="key-option-content">
                            <span class="key-option-title">Unique Key for this Profile</span>
                            <span id="previewUnique" class="key-option-preview">---</span>
                        </div>
                    </label>
                </div>
                <div class="key-status-row" style="margin-top: 10px;">
                    <button id="setKeyFinalBtn" class="settings-done small">Confirm Key</button>
                    <button id="cancelKeySettingsBtn" class="settings-done small secondary">Back</button>
                </div>
            </div>

            <div class="form-actions-row">
                <button id="saveProfileBtn" class="settings-done">Save Profile</button>
                <button id="cancelEditBtn" class="settings-done secondary">Cancel</button>
            </div>
        `;

        const idInput = form.querySelector('#editProfileId');
        const modelInput = form.querySelector('#editProfileModel');
        const endpointInput = form.querySelector('#editProfileEndpoint');
        const endpointDropdownList = form.querySelector('#endpointDropdownList');
        const endpointDropdownWrapper = form.querySelector('.dropdown-input-wrapper');

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

        if (!(idInput instanceof HTMLInputElement) || 
            !(modelInput instanceof HTMLInputElement) || 
            !(endpointInput instanceof HTMLInputElement) || 
            !(endpointDropdownList instanceof HTMLElement) || 
            !(endpointDropdownWrapper instanceof HTMLElement) ||
            !(keyCheckSection instanceof HTMLElement) || 
            !(keySettingsSection instanceof HTMLElement) || 
            !(keyTypeShared instanceof HTMLInputElement) || 
            !(keyTypeUnique instanceof HTMLInputElement) || 
            !(previewShared instanceof HTMLElement) || 
            !(previewUnique instanceof HTMLElement) || 
            !(setKeyFlowBtn instanceof HTMLButtonElement) || 
            !(noKeyRequiredBtn instanceof HTMLButtonElement) || 
            !(setKeyFinalBtn instanceof HTMLButtonElement) || 
            !(cancelKeySettingsBtn instanceof HTMLButtonElement) || 
            !(saveBtn instanceof HTMLButtonElement) || 
            !(cancelBtn instanceof HTMLButtonElement) || 
            !(keyStatusIndicator instanceof HTMLElement)) {
            return;
        }

        let isIdManuallyEdited = isEdit;

        /**
         * Renders the custom dropdown items.
         */
        const renderDropdownItems = (filter: string = '') => {
            const normalizedFilter = filter.toLowerCase().trim();
            const filtered = existingEndpoints.filter(e => e.toLowerCase().includes(normalizedFilter));
            
            endpointDropdownList.innerHTML = '';
            
            filtered.forEach(e => {
                const item = document.createElement('div');
                item.className = 'custom-dropdown-item';
                item.textContent = e;
                item.addEventListener('mousedown', (evt) => {
                    evt.preventDefault();
                    endpointInput.value = e;
                    hideDropdown();
                    computeSuggestedId();
                    updateKeyStatus();
                });
                endpointDropdownList.appendChild(item);
            });

            // Always add the "New Endpoint..." action at the bottom
            const newAction = document.createElement('div');
            newAction.className = 'custom-dropdown-item new-endpoint-action';
            newAction.textContent = '+ New Provider URL...';
            newAction.addEventListener('mousedown', (evt) => {
                evt.preventDefault();
                endpointInput.value = '';
                hideDropdown();
                endpointInput.focus();
                computeSuggestedId();
                updateKeyStatus();
            });
            endpointDropdownList.appendChild(newAction);
        };

        const showDropdown = () => {
            renderDropdownItems(endpointInput.value);
            endpointDropdownList.classList.add('visible');
            endpointDropdownWrapper.classList.add('open');
        };

        const hideDropdown = () => {
            endpointDropdownList.classList.remove('visible');
            endpointDropdownWrapper.classList.remove('open');
        };

        /**
         * Computes a suggested profile ID.
         */
        const computeSuggestedId = () => {
            if (isIdManuallyEdited) { return; }
            
            const endpoint = endpointInput.value.trim();
            const model = modelInput.value.trim();
            
            if (!endpoint && !model) {
                idInput.value = '';
                return;
            }

            const brand = this.getBrandFromUrl(endpoint).toLowerCase();
            const cleanModel = model.toLowerCase().replace(/[^a-z0-9]/g, '-');
            
            if (brand && cleanModel) {
                idInput.value = `${brand}-${cleanModel}`;
            } else if (brand) {
                idInput.value = brand;
            } else if (cleanModel) {
                idInput.value = cleanModel;
            }
        };

        /**
         * Resolves the current identifier based on selection.
         */
        const getCurrentIdentifier = (): string => {
            const isShared = keyTypeShared.checked;
            const brand = this.getBrandFromUrl(endpointInput.value.trim());
            const id = idInput.value.trim();
            
            if (isShared) {
                return brand ? `${brand}_API_KEY` : '';
            } else {
                return id ? `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY` : '';
            }
        };

        /**
         * Checks if the current identifier has a key in the secret manager.
         */
        const updateKeyStatus = () => {
            const endpoint = endpointInput.value.trim();
            const model = modelInput.value.trim();
            const id = idInput.value.trim();
            const isFormComplete = !!(endpoint && model && id);

            // Toggle disabled state of the whole section
            keyCheckSection.classList.toggle('section-disabled', !isFormComplete);

            const currentIdentifier = getCurrentIdentifier();
            
            // Update previews
            const brand = this.getBrandFromUrl(endpoint);
            previewShared.textContent = brand ? `${brand}_API_KEY` : '---';
            previewUnique.textContent = id ? `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY` : '---';

            // Check if ANY existing profile uses this identifier and has a key
            const existingWithKey = state.profileMetadata?.find(p => p.apiKeyIdentifier === currentIdentifier && p.hasApiKey);
            const hasKey = !!existingWithKey;

            if (hasKey) {
                keyStatusIndicator.innerHTML = '<span class="status-badge success">✅ Key Ready</span>';
                setKeyFlowBtn.style.display = 'none';
                noKeyRequiredBtn.style.display = 'none';
            } else {
                keyStatusIndicator.innerHTML = '<span class="status-badge warning">❌ No Key Set</span>';
                setKeyFlowBtn.style.display = 'inline-block';
                noKeyRequiredBtn.style.display = 'inline-block';
            }

            // Enable/Disable buttons based on form completion
            setKeyFlowBtn.disabled = !isFormComplete;
            noKeyRequiredBtn.disabled = !isFormComplete;
            saveBtn.disabled = !isFormComplete;
        };

        // Listeners
        endpointInput.addEventListener('focus', showDropdown);
        endpointInput.addEventListener('input', () => {
            renderDropdownItems(endpointInput.value);
            computeSuggestedId();
            updateKeyStatus();
        });
        endpointInput.addEventListener('blur', () => {
            setTimeout(hideDropdown, 200); // Allow clicks on items to register
        });

        modelInput.addEventListener('input', () => {
            computeSuggestedId();
            updateKeyStatus();
        });
        idInput.addEventListener('input', () => {
            isIdManuallyEdited = true;
            updateKeyStatus();
        });

        keyTypeShared.addEventListener('change', updateKeyStatus);
        keyTypeUnique.addEventListener('change', updateKeyStatus);

        setKeyFlowBtn.addEventListener('click', () => {
            keyCheckSection.style.display = 'none';
            keySettingsSection.style.display = 'block';
        });

        cancelKeySettingsBtn.addEventListener('click', () => {
            keySettingsSection.style.display = 'none';
            keyCheckSection.style.display = 'block';
        });

        setKeyFinalBtn.addEventListener('click', () => {
            const identifier = getCurrentIdentifier();
            if (identifier) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.EDIT_API_KEY,
                    identifier: identifier
                });
            }
        });

        noKeyRequiredBtn.addEventListener('click', () => {
            const id = idInput.value.trim();
            const model = modelInput.value.trim();
            const endpoint = endpointInput.value.trim();

            if (id && model && endpoint) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.ADD_PROFILE,
                    profile: {
                        id,
                        model,
                        endpoint,
                        isApiKeyRequired: false
                    }
                });
                this.onDone();
            }
        });

        saveBtn.addEventListener('click', () => {
            const id = idInput.value.trim();
            const model = modelInput.value.trim();
            const endpoint = endpointInput.value.trim();
            const identifier = getCurrentIdentifier();

            if (id && model && endpoint && identifier) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.ADD_PROFILE,
                    profile: {
                        id,
                        model,
                        endpoint,
                        apiKeyIdentifier: identifier,
                        isApiKeyRequired: true
                    }
                });
                this.onDone();
            }
        });

        cancelBtn.addEventListener('click', () => {
            this.onDone();
        });

        // Initial check
        updateKeyStatus();

        container.appendChild(form);
    }
}
