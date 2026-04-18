// Minimal settings overlay module
import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi } from '../types.js';
import type { InitialState } from './chat.js';

export let _overlayRoot: HTMLDivElement | null = null;
let _doneButton: HTMLButtonElement | null = null;

const EDIT_ICON_HTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
const DELETE_ICON_HTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

export function initOverlay(container: HTMLElement) {
  if (_overlayRoot) {
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
  _overlayRoot = overlay;

  const doneBtn = overlay.querySelector('#settingsDoneBtn');
  if (doneBtn instanceof HTMLButtonElement) {
    _doneButton = doneBtn;
    _doneButton.addEventListener('click', () => {
      hideOverlay();
    });
  }
}

export function showOverlay() {
  if (!_overlayRoot) {
    return;
  }
  _overlayRoot.classList.remove('hidden');
  document.body.classList.add('overlay-open');
  _doneButton?.focus();
}

export function hideOverlay() {
  if (!_overlayRoot) {
    return;
  }
  _overlayRoot.classList.add('hidden');
  document.body.classList.remove('overlay-open');
}

export function isOverlayVisible(): boolean {
    return !!_overlayRoot && !_overlayRoot.classList.contains('hidden');
}

/**
 * Render profile settings with API key management.
 */
export function renderProfileSettings(vscode: IWebviewApi, state: InitialState) {
    if (!_overlayRoot) {
        return;
    }
    const body = _overlayRoot.querySelector('.settings-body');
    if (!(body instanceof HTMLElement)) {
        return;
    }

    body.innerHTML = '';

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
            if (profile.apiKeyPlaceholder) {
                vscode.postMessage({ command: WEBVIEW_COMMANDS.EDIT_API_KEY, placeholder: profile.apiKeyPlaceholder });
            }
        });

        item.querySelector('.delete-btn')?.addEventListener('click', () => {
            if (profile.apiKeyPlaceholder) {
                vscode.postMessage({ command: WEBVIEW_COMMANDS.DELETE_API_KEY, placeholder: profile.apiKeyPlaceholder });
            }
        });

        list.appendChild(item);
    });

    body.appendChild(section);
}

/**
 * @deprecated Use renderProfileSettings
 */
export function setupCompletionProfileSelector(_vscode: IWebviewApi, _profiles: string[] = [], _activeCompletionProfile?: string) {
    // Keep for backward compatibility if needed.
}
