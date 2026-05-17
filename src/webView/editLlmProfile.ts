import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi, ProfileMetadata } from '../types.js';

/**
 * Manages the LLM Profile Edit/Add form UI.
 */
export class EditLlmProfile {
    private onDone: () => void;

    constructor(onDone: () => void) {
        this.onDone = onDone;
    }

    /**
     * Renders the form.
     * @param container Element to render into
     * @param vscode Webview API
     * @param profile Optional profile to edit. If null, it's an "Add" form.
     */
    public render(container: HTMLElement, vscode: IWebviewApi, profile: ProfileMetadata | null = null) {
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
                <input type="text" id="editProfileEndpoint" value="${profile?.endpoint || ''}" placeholder="e.g. https://api.openai.com/v1/chat/completions" class="settings-input">
            </div>

            <div class="form-actions-row">
                <button id="saveProfileBtn" class="settings-done">Save Profile</button>
                <button id="cancelEditBtn" class="settings-done secondary">Back</button>
            </div>
        `;

        const saveBtn = form.querySelector('#saveProfileBtn');
        const cancelBtn = form.querySelector('#cancelEditBtn');

        if (saveBtn instanceof HTMLButtonElement) {
            saveBtn.addEventListener('click', () => {
                const idInput = form.querySelector('#editProfileId');
                const modelInput = form.querySelector('#editProfileModel');
                const endpointInput = form.querySelector('#editProfileEndpoint');

                if (idInput instanceof HTMLInputElement && 
                    modelInput instanceof HTMLInputElement && 
                    endpointInput instanceof HTMLInputElement) {
                    
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
                                // All models are OpenAI compatible now
                                apiKey: profile?.apiKeyPlaceholder || ('${' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY}')
                            }
                        });
                        this.onDone();
                    } else {
                        // Basic validation
                        idInput.style.borderColor = id ? '' : 'var(--vscode-errorForeground)';
                        modelInput.style.borderColor = model ? '' : 'var(--vscode-errorForeground)';
                        endpointInput.style.borderColor = endpoint ? '' : 'var(--vscode-errorForeground)';
                    }
                }
            });
        }

        if (cancelBtn instanceof HTMLButtonElement) {
            cancelBtn.addEventListener('click', () => {
                this.onDone();
            });
        }

        container.appendChild(form);
    }
}
