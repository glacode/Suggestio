import { MessageSegment } from './messageSegment.js';

// Provided by the environment (main.ts)
declare const window: Window & {
    renderMarkdown: (text: string) => string;
};

export class ContentSegment extends MessageSegment {
    public contentText = '';
    constructor(container: HTMLElement) {
        super(container, 'content');
        this.element.className = 'message-content';
    }

    append(text: string) {
        this.contentText += text;
        this.element.innerHTML = window.renderMarkdown(this.contentText);
    }

    update() {}
}
