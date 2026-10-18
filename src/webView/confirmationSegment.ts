import { MessageSegment } from './messageSegment.js';
import type { IChatManagerActions, ToolCallDecision } from '../types.js';

export class ConfirmationSegment extends MessageSegment {
    public toolCallId: string;
    constructor(private chatManager: IChatManagerActions, container: HTMLElement, payload: any) {
        super(container, 'confirmation');
        this.toolCallId = payload.toolCallId;
        this.element.className = 'tool-confirmation-container';
        this.element.id = 'confirm-' + this.toolCallId;
        const header = document.createElement('div');
        header.className = 'tool-confirmation-header';

        const headerIcon = document.createElement('span');
        headerIcon.className = 'tool-confirmation-icon';
        headerIcon.textContent = 'ℹ️';
        header.appendChild(headerIcon);

        const headerLabel = document.createElement('span');
        headerLabel.textContent = 'Tool Request';
        header.appendChild(headerLabel);

        this.element.appendChild(header);

        const messageContainer = document.createElement('div');
        messageContainer.className = 'tool-confirmation-message';
        messageContainer.innerHTML = payload.message;
        this.element.appendChild(messageContainer);

        if (payload.diffData) {
            const viewDiffContainer = document.createElement('div');
            viewDiffContainer.className = 'mt-8 flex-center';

            const viewDiffButton = document.createElement('button');
            viewDiffButton.className = 'tool-button tool-button-secondary view-diff-btn full-width';
            viewDiffButton.textContent = '🔍 View Diff';
            viewDiffButton.addEventListener('click', () => {
                this.chatManager.viewDiff(this.toolCallId);
            });

            viewDiffContainer.appendChild(viewDiffButton);
            this.element.appendChild(viewDiffContainer);
        }

        const buttonsRow = document.createElement('div');
        buttonsRow.className = 'tool-confirmation-buttons';

        const allowButton = document.createElement('button');
        allowButton.className = 'tool-button tool-button-primary allow-btn';
        allowButton.textContent = 'Allow';
        allowButton.addEventListener('click', () => {
            this.chatManager.confirmTool(this.toolCallId, 'allow');
        });
        buttonsRow.appendChild(allowButton);

        if (payload.diffData || payload.toolName === 'run_command') {
            const alwaysAllowButton = document.createElement('button');
            alwaysAllowButton.className = 'tool-button tool-button-secondary always-allow-btn';
            alwaysAllowButton.dataset.tooltip = payload.diffData
                ? 'Enable auto-accept for all edits in this session'
                : 'Always allow this exact command in this session';
            alwaysAllowButton.textContent = 'Always Allow';
            alwaysAllowButton.addEventListener('click', () => {
                const decision: ToolCallDecision = payload.diffData ? 'always-allow-edit' : 'always-allow-command';
                this.chatManager.confirmTool(this.toolCallId, decision);
            });
            buttonsRow.appendChild(alwaysAllowButton);
        }

        const denyButton = document.createElement('button');
        denyButton.className = 'tool-button tool-button-secondary deny-btn';
        denyButton.textContent = 'Deny';
        denyButton.addEventListener('click', () => {
            this.chatManager.confirmTool(this.toolCallId, 'deny');
        });
        buttonsRow.appendChild(denyButton);

        this.element.appendChild(buttonsRow);
    }

    append() {}
    update() {}
}
