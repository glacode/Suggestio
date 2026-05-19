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

    /**
     * Renders the form.
     * @param container Element to render into
     * @param vscode Webview API
     * @param state Current initial state for context-aware suggestions
     * @param profile Optional profile to edit. If null, it's an "Add" form.
     */
    public render(container: HTMLElement, vscode: IWebviewApi, state: InitialState, profile: ProfileMetadata | null = null) {
        container.innerHTML = '';

        const isEdit = !!profile;
        const title = isEdit ? `Edit Profile: ${profile.id}` : 'Add Custom Profile';

        const form = document.createElement('div');
        form.className = 'edit-profile-form';
        form.innerHTML = `
            <h3 class="settings-subtitle">${title}</h3>
            
            <div class="input-group">
                <label class="settings-label">Profile ID (used in dropdown)</label>
                <input type="text" id="editProfileId" value="${profile?.id || ''}" placeholder="e.g. my-custom-gpt" class="settings-input" ${isEdit ? 'disabled' : ''}>
            </div>
            
            <div class="input-group">
                <label class="settings-label">Model Name (e.g. gpt-4o)</label>
                <input type="text" id="editProfileModel" value="${profile?.model || ''}" placeholder="e.g. gpt-4" class="settings-input">
            </div>
            
            <div class="input-group">
                <label class="settings-label">Endpoint URL</label>
                <input type="text" id="editProfileEndpoint" value="${profile?.endpoint || ''}" placeholder="e.g. https://api.openai.com/v1" class="settings-input">
            </div>

            <div class="settings-section-divider"></div>

            <div class="input-group">
                <label class="settings-label">API Key Security</label>
                <div class="settings-description">Choose how you want to link the API Key for this profile.</div>
                
                <div class="key-options-group">
                    <label class="key-option" for="keyTypeShared">
                        <input type="radio" name="keyType" id="keyTypeShared" value="shared" checked>
                        <div class="key-option-content">
                            <span class="key-option-title">Shared Provider Key (Recommended)</span>
                            <span class="key-option-description">Share one key across all models from this provider.</span>
                            <span id="previewShared" class="key-option-preview">---</span>
                        </div>
                    </label>

                    <label class="key-option" for="keyTypeUnique">
                        <input type="radio" name="keyType" id="keyTypeUnique" value="unique">
                        <div class="key-option-content">
                            <span class="key-option-title">Unique Key for this Model</span>
                            <span class="key-option-description">Use a dedicated key only for this specific profile.</span>
                            <span id="previewUnique" class="key-option-preview">---</span>
                        </div>
                    </label>
                </div>
            </div>

            <div id="keyStatusContainer" class="key-status-container">
                <div class="key-status-row">
                    <div id="keyStatusIndicator" class="status-indicator">
                        <!-- Dynamic Status -->
                    </div>
                    <button id="setKeyBtn" class="settings-done small">Set API Key Now</button>
                </div>
            </div>

            <div class="form-actions-row">
                <button id="saveProfileBtn" class="settings-done">Save Profile</button>
                <button id="cancelEditBtn" class="settings-done secondary">Back</button>
            </div>
        `;

        const idInput = form.querySelector('#editProfileId');
        const modelInput = form.querySelector('#editProfileModel');
        const endpointInput = form.querySelector('#editProfileEndpoint');
        const keyTypeShared = form.querySelector('#keyTypeShared');
        const keyTypeUnique = form.querySelector('#keyTypeUnique');
        const previewShared = form.querySelector('#previewShared');
        const previewUnique = form.querySelector('#previewUnique');
        const setKeyBtn = form.querySelector('#setKeyBtn');
        const saveBtn = form.querySelector('#saveProfileBtn');
        const cancelBtn = form.querySelector('#cancelEditBtn');
        const keyStatusIndicator = form.querySelector('#keyStatusIndicator');
        const keyStatusContainer = form.querySelector('#keyStatusContainer');

        if (!(idInput instanceof HTMLInputElement) || 
            !(modelInput instanceof HTMLInputElement) || 
            !(endpointInput instanceof HTMLInputElement) || 
            !(keyTypeShared instanceof HTMLInputElement) || 
            !(keyTypeUnique instanceof HTMLInputElement) || 
            !(previewShared instanceof HTMLElement) || 
            !(previewUnique instanceof HTMLElement) || 
            !(setKeyBtn instanceof HTMLButtonElement) || 
            !(saveBtn instanceof HTMLButtonElement) || 
            !(cancelBtn instanceof HTMLButtonElement) || 
            !(keyStatusIndicator instanceof HTMLElement) ||
            !(keyStatusContainer instanceof HTMLElement)) {
            return;
        }

        /**
         * Resolves the current placeholder based on selection.
         */
        const getCurrentPlaceholder = (): string => {
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
         * Checks if the current placeholder has a key in the secret manager.
         */
        const updateKeyStatus = () => {
            const currentName = getCurrentPlaceholder();
            
            // Highlight active option visually
            keyTypeShared.closest('.key-option')?.classList.toggle('active', keyTypeShared.checked);
            keyTypeUnique.closest('.key-option')?.classList.toggle('active', keyTypeUnique.checked);

            // Update previews
            const brand = this.getBrandFromUrl(endpointInput.value.trim());
            const id = idInput.value.trim();
            previewShared.textContent = brand ? `${brand}_API_KEY` : 'Enter endpoint...';
            previewUnique.textContent = id ? `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY` : 'Enter ID...';

            if (currentName === '') {
                keyStatusContainer.style.display = 'none';
                return;
            }

            keyStatusContainer.style.display = 'block';
            setKeyBtn.textContent = `Set key for ${currentName}`;

            // Check if ANY existing profile uses this placeholder and has a key
            const existingProfile = state.profileMetadata?.find(p => p.apiKeyPlaceholder === currentName);
            const hasKey = existingProfile?.hasApiKey || false;

            if (hasKey) {
                keyStatusIndicator.innerHTML = '<span class="status-badge success">✅ Key is ready</span>';
            } else {
                keyStatusIndicator.innerHTML = '<span class="status-badge warning">❌ No key set</span>';
            }
        };

        // Listeners
        idInput.addEventListener('input', updateKeyStatus);
        endpointInput.addEventListener('input', updateKeyStatus);
        keyTypeShared.addEventListener('change', updateKeyStatus);
        keyTypeUnique.addEventListener('change', updateKeyStatus);

        setKeyBtn.addEventListener('click', () => {
            const placeholder = getCurrentPlaceholder();
            if (placeholder) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.EDIT_API_KEY,
                    placeholder: placeholder
                });
            }
        });

        saveBtn.addEventListener('click', () => {
            const id = idInput.value.trim();
            const model = modelInput.value.trim();
            const endpoint = endpointInput.value.trim();
            const placeholder = getCurrentPlaceholder();

            if (id && model && endpoint && placeholder) {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.ADD_PROFILE,
                    profile: {
                        id,
                        model,
                        endpoint,
                        apiKey: `\${${placeholder}}`
                    }
                });
                this.onDone();
            } else {
                // Basic validation
                idInput.style.borderColor = id ? '' : 'var(--vscode-errorForeground)';
                modelInput.style.borderColor = model ? '' : 'var(--vscode-errorForeground)';
                endpointInput.style.borderColor = endpoint ? '' : 'var(--vscode-errorForeground)';
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
