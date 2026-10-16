import { MessageSegment } from './messageSegment.js';
import type { IChatManagerActions } from '../types.js';

export class ToolCallSegment extends MessageSegment {
    public toolCallId: string;
    public toolName: string;
    public displayMessage: string;
    private statusIcon: HTMLSpanElement;
    private statusText: HTMLSpanElement;
    private details: HTMLDetailsElement;
    private pre: HTMLPreElement;
    private outputContainer: HTMLDivElement | null = null;

    constructor(private chatManager: IChatManagerActions, container: HTMLElement, payload: any) {
        super(container, 'tool_call');
        this.toolCallId = payload.toolCallId;
        this.toolName = payload.toolName;
        this.displayMessage = payload.displayMessage || `Running <span class="tool-name">${payload.toolName}</span>...`;
        this.element.className = 'tool-call-container';
        this.element.id = 'tool-' + this.toolCallId;

        let prettyArgs = payload.args;
        try {
            prettyArgs = JSON.stringify(JSON.parse(payload.args), null, 2);
        } catch (e) {}

        // Determine if the arguments should be visible or collapsed based on tool-provided hints.
        // We avoid hardcoding tool names here to keep the UI generic and data-driven.
        const isOpen = !payload.uiOptions?.collapseByDefault;
        const details = document.createElement('details');
        details.open = isOpen;

        const summary = document.createElement('summary');

        const statusIcon = document.createElement('span');
        statusIcon.className = 'tool-call-status-icon';
        statusIcon.textContent = '⚙️';
        summary.appendChild(statusIcon);

        const statusText = document.createElement('span');
        statusText.className = 'tool-status-text';
        statusText.innerHTML = this.displayMessage;
        summary.appendChild(statusText);

        details.appendChild(summary);

        const pre = document.createElement('pre');
        // Preserve the template's exact HTML-parsing semantics for the args:
        // assigned as HTML (not textContent), as before.
        pre.innerHTML = prettyArgs;
        details.appendChild(pre);

        const outputContainer = document.createElement('div');
        outputContainer.className = 'tool-output';
        details.appendChild(outputContainer);

        this.element.appendChild(details);
        this.statusIcon = statusIcon;
        this.statusText = statusText;
        this.details = details;
        this.pre = pre;
        this.outputContainer = outputContainer;

        // Ensure that when the tool details are expanded or collapsed,
        // we adjust the scroll position to keep the content visible.
        this.details.addEventListener('toggle', () => {
            this.chatManager.scrollToBottom();
        });
    }

    appendOutput(text: string) {
        if (this.outputContainer) {
            this.outputContainer.textContent += text;
            this.outputContainer.scrollTop = this.outputContainer.scrollHeight;

            // If it was collapsed and we got output, maybe we should expand?
            // But usually we keep it as it was.
        }
    }

    startSpinner() {
        // Replace gear icon with spinning SVG circle
        const spinnerSvg = `<svg class="tool-spinner" width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
            <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 4" />
        </svg>`;
        this.statusIcon.innerHTML = spinnerSvg;
        this.statusIcon.classList.add('spinning');
    }

    append() {}

    update(payload: any) {
        this.details.removeAttribute('open');
        this.statusIcon.textContent = payload.success ? '✅' : '❌';
        this.statusIcon.classList.remove('spinning');
        let message = payload.customMessage || this.displayMessage;
        if (!message || message.includes('Running')) {
            message = `Used <span class="tool-name">${payload.toolName}</span>`;
        }
        this.statusText.innerHTML = message.replace(/\.+$/, '');
        if (!payload.success) {
            this.statusText.classList.add('validation-error');
        }
        if (payload.result) {
            this.pre.textContent = payload.result;
        }

        // Remove the tool output container upon tool completion to free memory.
        if (this.outputContainer) {
            this.outputContainer.remove();
            this.outputContainer = null;
        }
    }
}
