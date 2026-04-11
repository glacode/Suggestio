// Minimal settings overlay module
import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi } from '../types.js';

export let _overlayRoot: HTMLDivElement | null = null;
let _doneButton: HTMLButtonElement | null = null;

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

/**
 * Render a completion profile selector inside the settings overlay.
 */
export function setupCompletionProfileSelector(vscode: IWebviewApi, profiles: string[] = [], activeCompletionProfile?: string) {
  if (!_overlayRoot) {
    return;
  }
  const bodyEl = _overlayRoot.querySelector('.settings-body');
  if (!(bodyEl instanceof HTMLElement)) {
    return;
  }
  const body = bodyEl;

  // Clear existing content
  body.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'settings-section';
  container.innerHTML = `
    <label class="settings-label">Inline Completion Profile</label>
    <div class="profile-selector">
      <div class="selected-profile">${activeCompletionProfile || ''}</div>
      <div class="profile-options" style="display:none"></div>
    </div>
  `;

  const selectedEl = container.querySelector('.selected-profile');
  if (!(selectedEl instanceof HTMLElement)) {
    return;
  }
  const selected = selectedEl;
  const optionsEl = container.querySelector('.profile-options');
  if (!(optionsEl instanceof HTMLElement)) {
    return;
  }
  const options = optionsEl;

  profiles.forEach(id => {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = id;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      selected.textContent = id;
      options.style.display = 'none';
      try {
        vscode.postMessage({ command: WEBVIEW_COMMANDS.COMPLETION_PROFILE_CHANGED, model: id });
      } catch (err) {
        // ignore
      }
    });
    options.appendChild(a);
  });

  selected.addEventListener('click', () => {
    options.style.display = options.style.display === 'block' ? 'none' : 'block';
  });

  document.addEventListener('click', (e) => {
    if (!_overlayRoot) {
      return;
    }
    if (e.target instanceof Node && !_overlayRoot.contains(e.target)) {
      options.style.display = 'none';
    }
  });

  body.appendChild(container);
}
