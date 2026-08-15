// History overlay module
import { WEBVIEW_COMMANDS } from '../constants/protocol.js';
import type { IWebviewApi } from '../types.js';

const DELETE_ICON_HTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

export interface ISessionSummary {
    id: string;
    title: string;
    timestamp: number;
    fullPrompt?: string;
}

/**
 * Manages the history overlay UI.
 */
export class HistoryOverlay {
    private overlayRoot: HTMLDivElement | null = null;
    private doneButton: HTMLButtonElement | null = null;

    /**
     * Initializes the overlay and appends it to the container.
     */
    public init(container: HTMLElement) {
        if (this.overlayRoot) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'historyOverlay';
        overlay.className = 'history-overlay hidden';

        overlay.innerHTML = `
            <div class="history-panel" role="dialog" aria-modal="true">
                <h2 class="history-title">Chat History</h2>
                <div class="history-body">
                    <div class="history-list"></div>
                </div>
                <div class="history-footer">
                    <button id="historyDoneBtn" class="history-done">Done</button>
                </div>
            </div>
        `;

        container.appendChild(overlay);
        this.overlayRoot = overlay;

        const doneBtn = overlay.querySelector('#historyDoneBtn');
        if (doneBtn instanceof HTMLButtonElement) {
            this.doneButton = doneBtn;
            this.doneButton.addEventListener('click', () => {
                this.hide();
            });
        }
    }

    /**
     * Shows the history overlay.
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
     * Hides the history overlay.
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
     * Renders history sessions.
     */
    public render(vscode: IWebviewApi, sessions: ISessionSummary[]) {
        if (!this.overlayRoot) {
            return;
        }
        const list = this.overlayRoot.querySelector('.history-list');
        if (!(list instanceof HTMLElement)) {
            return;
        }

        list.innerHTML = '';

        if (sessions.length === 0) {
            list.innerHTML = '<div class="no-history">No chat history found.</div>';
            return;
        }

        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'history-item';
            if (session.fullPrompt) {
                item.title = session.fullPrompt;
            }
            
            const date = new Date(session.timestamp).toLocaleString();

            item.innerHTML = `
                <div class="history-info">
                    <div class="history-session-title">${session.title}</div>
                    <div class="history-session-date">${date}</div>
                </div>
                <button class="icon-button delete-session-btn" title="Delete Session">${DELETE_ICON_HTML}</button>
            `;

            const deleteBtn = item.querySelector('.delete-session-btn');
            if (deleteBtn instanceof HTMLButtonElement) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({ command: WEBVIEW_COMMANDS.DELETE_SESSION, sessionId: session.id });
                });
            }

            item.addEventListener('click', () => {
                // Show loading spinner
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.classList.add('visible');
                }
                vscode.postMessage({ command: WEBVIEW_COMMANDS.LOAD_SESSION, sessionId: session.id });
                this.hide();
            });

            list.appendChild(item);
        });
    }
}
