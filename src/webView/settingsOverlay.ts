// Settings overlay module
import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi, InitialState } from '../types.js';
import { EditLlmProfile } from './editLlmProfile.js';

const EDIT_ICON_HTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
const DELETE_ICON_HTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

/**
 * Manages the settings overlay UI.
 */
export class SettingsOverlay {
    private overlayRoot: HTMLDivElement | null = null;
    private doneButton: HTMLButtonElement | null = null;
    private editProfile: EditLlmProfile;
    private currentView: 'list' | 'edit' = 'list';
    private vscode: IWebviewApi | null = null;
    private state: InitialState | null = null;

    constructor() {
        this.editProfile = new EditLlmProfile(() => this.showList());
    }

    private showList() {
        this.currentView = 'list';
        if (this.vscode && this.state) {
            this.render(this.vscode, this.state);
        }
    }

    private showEdit() {
        this.currentView = 'edit';
        if (this.vscode && this.state) {
            this.render(this.vscode, this.state);
        }
    }

    /**
     * Initializes the overlay and appends it to the container.
     */
    public init(container: HTMLElement) {
        if (this.overlayRoot) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'settingsOverlay';
        overlay.className = 'settings-overlay hidden';

        overlay.innerHTML = `
            <div class="settings-panel" role="dialog" aria-modal="true">
                <h2 class="settings-title">Settings</h2>
                <div class="settings-body"></div>
                <div class="settings-footer">
                    <button id="settingsDoneBtn" class="settings-done">Done</button>
                </div>
            </div>
        `;

        container.appendChild(overlay);
        this.overlayRoot = overlay;

        const doneBtn = overlay.querySelector('#settingsDoneBtn');
        if (doneBtn instanceof HTMLButtonElement) {
            this.doneButton = doneBtn;
            this.doneButton.addEventListener('click', () => {
                this.hide();
            });
        }
    }

    /**
     * Shows the settings overlay.
     */
    public show() {
        if (!this.overlayRoot) {
            return;
        }
        this.overlayRoot.classList.remove('hidden');
        document.body.classList.add('overlay-open');
        this.doneButton?.focus();
    }

    /**
     * Hides the settings overlay.
     */
    public hide() {
        if (!this.overlayRoot) {
            return;
        }
        this.overlayRoot.classList.add('hidden');
        document.body.classList.remove('overlay-open');
    }

    /**
     * Returns true if the overlay is currently visible.
     */
    public isVisible(): boolean {
        return !!this.overlayRoot && !this.overlayRoot.classList.contains('hidden');
    }

    /**
     * Renders profile settings with API key management.
     */
    public render(vscode: IWebviewApi, state: InitialState) {
        this.vscode = vscode;
        this.state = state;
        if (!this.overlayRoot) {
            return;
        }
        const body = this.overlayRoot.querySelector('.settings-body');
        if (!(body instanceof HTMLElement)) {
            return;
        }

        body.innerHTML = '';

        if (this.currentView === 'edit') {
            this.editProfile.render(body, vscode, state);
            return;
        }

        // List View
        const topActions = document.createElement('div');
        topActions.className = 'add-profile-btn-container';
        topActions.innerHTML = `<button id="topAddProfileBtn" class="settings-done">+ Add Custom Profile</button>`;
        topActions.querySelector('#topAddProfileBtn')?.addEventListener('click', () => this.showEdit());
        body.appendChild(topActions);

        const section = document.createElement('div');
        section.className = 'settings-section';
        section.innerHTML = `
            <h3 class="settings-subtitle">Language Model Profiles</h3>
            <div class="profiles-list"></div>
        `;

        const list = section.querySelector('.profiles-list');
        if (!(list instanceof HTMLElement)) {
            return;
        }

        const metadata = state.profileMetadata || [];

        metadata.forEach(profile => {
            const item = document.createElement('div');
            item.className = `profile-item ${profile.isActiveCompletion ? 'active' : ''}`;
            
            const keyStatus = profile.needsApiKey 
                ? (profile.hasApiKey ? '<span class="status-badge success">Key ✅</span>' : '<span class="status-badge warning">No Key ❌</span>')
                : '<span class="status-badge info">No Key Required</span>';

            item.innerHTML = `
                <div class="profile-info">
                    <div class="profile-name-row">
                        <span class="profile-id">${profile.id}</span>
                        ${profile.isActiveCompletion ? '<span class="active-badge">ACTIVE</span>' : ''}
                    </div>
                    <div class="profile-details">${profile.model}</div>
                    <div class="profile-status">${keyStatus}</div>
                </div>
                <div class="profile-actions">
                    ${!profile.isActiveCompletion ? `<button class="icon-button select-btn" title="Select for Completion">Set Active</button>` : ''}
                    ${profile.needsApiKey ? `
                        <button class="icon-button edit-btn" title="Edit API Key">${EDIT_ICON_HTML}</button>
                        ${profile.hasApiKey ? `<button class="icon-button delete-btn" title="Delete API Key">${DELETE_ICON_HTML}</button>` : ''}
                    ` : ''}
                </div>
            `;

            item.querySelector('.select-btn')?.addEventListener('click', () => {
                vscode.postMessage({ command: WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED, model: profile.id });
            });

            item.querySelector('.edit-btn')?.addEventListener('click', () => {
                if (profile.apiKeyIdentifier) {
                    vscode.postMessage({ command: WEBVIEW_COMMANDS.EDIT_API_KEY, identifier: profile.apiKeyIdentifier });
                }
            });

            item.querySelector('.delete-btn')?.addEventListener('click', () => {
                if (profile.apiKeyIdentifier) {
                    vscode.postMessage({ command: WEBVIEW_COMMANDS.DELETE_API_KEY, identifier: profile.apiKeyIdentifier });
                }
            });

            list.appendChild(item);
        });

        body.appendChild(section);
    }
}
