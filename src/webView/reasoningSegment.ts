import { MessageSegment } from './messageSegment.js';
import { ContentSegment } from './contentSegment.js';
import { ToolCallSegment } from './toolCallSegment.js';
import { ConfirmationSegment } from './confirmationSegment.js';
import type { IChatManagerActions } from '../types.js';

export class ReasoningSegment extends MessageSegment {
    private contentElement: HTMLDivElement;
    private toggleIcon: HTMLSpanElement;
    public internalSegments: MessageSegment[] = [];
    private lastInternalTokenType: string | null = null;

    constructor(private chatManager: IChatManagerActions, container: HTMLElement) {
        super(container, 'reasoning');
        this.element.className = 'reasoning-container';
        const header = document.createElement('div');
        header.className = 'reasoning-header';

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'reasoning-toggle-icon';
        toggleIcon.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/>
            </svg>
        `;
        header.appendChild(toggleIcon);

        const label = document.createElement('span');
        label.textContent = 'Thought Process';
        header.appendChild(label);

        const contentElement = document.createElement('div');
        contentElement.className = 'reasoning-content';

        this.element.appendChild(header);
        this.element.appendChild(contentElement);
        this.contentElement = contentElement;
        this.toggleIcon = toggleIcon;

        header.addEventListener('click', () => {
            this.toggleReasoning();
        });
    }

    append(text: string) {
        if (this.lastInternalTokenType !== 'content' || !this.internalSegments.length) {
            const contentSegment = new ContentSegment(this.contentElement);
            this.internalSegments.push(contentSegment);
        }
        this.internalSegments[this.internalSegments.length - 1].append(text);
        this.lastInternalTokenType = 'content';
    }

    addToolCall(payload: any) {
        const toolCallSegment = new ToolCallSegment(this.chatManager, this.contentElement, payload);
        this.internalSegments.push(toolCallSegment);
        this.lastInternalTokenType = 'tool_call';
        return toolCallSegment;
    }

    addConfirmation(payload: any) {
        const confirmationSegment = new ConfirmationSegment(this.chatManager, this.contentElement, payload);
        this.internalSegments.push(confirmationSegment);
        this.lastInternalTokenType = 'confirmation';
        return confirmationSegment;
    }

    collapse() {
        if (!this.contentElement.classList.contains('collapsed')) {
            this.contentElement.classList.add('collapsed');
            this.toggleIcon.classList.add('collapsed');
        }
    }

    private toggleReasoning() {
        const isCollapsed = this.contentElement.classList.toggle('collapsed');
        this.toggleIcon.classList.toggle('collapsed', isCollapsed);
    }

    update() {}
}
