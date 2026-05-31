import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi, ProfileMetadata } from '../types.js';

/**
 * Manages the LLM Profile Delete confirmation UI.
 */
export class DeleteLlmProfile {
    private onDone: () => void;

    constructor(onDone: () => void) {
        this.onDone = onDone;
    }

    /**
     * Renders the delete confirmation form.
     * @param container Element to render into
     * @param vscode Webview API
     * @param profile The profile to delete
     */
    public render(container: HTMLElement, vscode: IWebviewApi, profile: ProfileMetadata) {
        container.innerHTML = '';

        const form = document.createElement('div');
        form.className = 'edit-profile-form'; // Reuse same layout styles
        form.innerHTML = `
            <h3 class="settings-subtitle validation-error">Delete Profile?</h3>
            
            <div class="input-group">
                <p>Are you sure you want to delete the profile <strong>"${profile.id}"</strong>?</p>
                <p class="settings-description mt-10">
                    This will remove the configuration from your settings.
                </p>
                <div class="status-badge warning mt-15 p-10">
                    <strong>Note:</strong> Any stored API keys for this profile will <strong>NOT</strong> be removed. 
                    This ensures other profiles sharing the same key identifier remain functional.
                </div>
            </div>

            <div class="form-actions-row mt-25">
                <button id="confirmDeleteBtn" class="settings-done danger-button">Delete Profile</button>
                <button id="cancelDeleteBtn" class="settings-done secondary">Cancel</button>
            </div>
        `;

        const confirmBtn = form.querySelector('#confirmDeleteBtn');
        const cancelBtn = form.querySelector('#cancelDeleteBtn');

        if (confirmBtn instanceof HTMLButtonElement) {
            confirmBtn.addEventListener('click', () => {
                vscode.postMessage({
                    command: WEBVIEW_COMMANDS.DELETE_PROFILE,
                    profileId: profile.id
                });
                this.onDone();
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
