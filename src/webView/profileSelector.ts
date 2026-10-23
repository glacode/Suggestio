import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi } from '../types.js';

/**
 * Owns the model-selector dropdown: element lookup with fail-fast guards,
 * rendering of the profile options, and outside-click-to-close behavior.
 */
export class ProfileSelector {
    // Stored as a named field so dispose() can detach exactly what
    // init() attached.
    private readonly handleDocumentClick = (e: Event) => {
        // Re-queried on every event: the id is unique and the element is
        // never recreated, so both lookups resolve to the same node; only
        // its classes are ever toggled.
        const modelSelector = document.getElementById('modelSelector');
        // Defensive: init() already throws when the element is missing,
        // so this early return is unreachable in practice.
        if (!modelSelector) {
            return;
        }
        const dropdownContent = modelSelector.querySelector('.dropdown-content');
        if (dropdownContent instanceof HTMLElement && e.target instanceof Node && !modelSelector.contains(e.target)) {
            dropdownContent.classList.remove('show');
        }
    };

    constructor(
        private vscode: IWebviewApi,
        private readonly openSettings: () => void
    ) {}

    init() {
        const modelSelector = document.getElementById('modelSelector');
        if (!modelSelector) {
            throw new Error('Model selector not found');
        }

        const dropdownLabel = modelSelector.querySelector('.dropdown-label');

        if (!(dropdownLabel instanceof HTMLElement)) {
            throw new Error('Dropdown elements not found');
        }

        dropdownLabel.addEventListener('click', () => {
            const dropdownContent = modelSelector.querySelector('.dropdown-content');
            if (dropdownContent instanceof HTMLElement) {
                dropdownContent.classList.toggle('show');
            }
        });

        // Attach outside-click-to-close via the named handler above.
        document.addEventListener('click', this.handleDocumentClick);
    }

    render(chatProfileIds: string[], activeChatProfileId: string) {
        const modelSelector = document.getElementById('modelSelector');
        const dropdownContent = modelSelector?.querySelector('.dropdown-content');
        const chatProfileLabel = modelSelector?.querySelector('.chat-profile-label');

        if (!dropdownContent || !chatProfileLabel) {
            return;
        }

        chatProfileLabel.textContent = activeChatProfileId;
        dropdownContent.innerHTML = '';

        chatProfileIds.forEach(profileId => {
            const option = document.createElement('a');
            option.href = '#';
            option.textContent = profileId;
            option.addEventListener('click', (e) => {
                e.preventDefault();
                chatProfileLabel.textContent = profileId;
                if (dropdownContent instanceof HTMLElement) {
                    dropdownContent.classList.remove('show');
                }
                this.vscode.postMessage({
                    command: WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED,
                    model: profileId
                });
            });
            dropdownContent.appendChild(option);
        });

        // Add "Manage Models..." entry
        const divider = document.createElement('div');
        divider.className = 'dropdown-divider';
        dropdownContent.appendChild(divider);

        const manageOption = document.createElement('a');
        manageOption.href = '#';
        manageOption.textContent = 'Manage Models...';
        manageOption.className = 'manage-profiles-item';
        manageOption.addEventListener('click', (e) => {
            e.preventDefault();
            if (dropdownContent instanceof HTMLElement) {
                dropdownContent.classList.remove('show');
            }
            this.openSettings();
        });
        dropdownContent.appendChild(manageOption);
    }

    dispose() {
        document.removeEventListener('click', this.handleDocumentClick);
    }
}
