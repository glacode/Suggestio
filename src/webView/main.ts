import { WEBVIEW_COMMANDS, EXTENSION_EVENTS } from '../constants/protocol.js';

/**
 * Interface for the initial state passed to the webview.
 */
interface InitialState {
    profiles: string[];
    activeProfile: string;
}

/**
 * Interface for the VS Code Webview API.
 */
interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

declare const acquireVsCodeApi: () => VsCodeApi;
declare const window: Window & { 
    initialState: InitialState;
    renderMarkdown: (text: string) => string;
};

const vscode = acquireVsCodeApi();

const SEND_ICON_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="7" y2="12"></line><polygon points="22 12 2 2 7 12 2 22 22 12"></polygon></svg>';
const STOP_ICON_HTML = '<span style="font-size: 28px; font-weight: bold; line-height: 1;">■</span>';

abstract class MessageSegment {
    public element: HTMLDivElement;
    constructor(protected container: HTMLElement, public type: string) {
        this.element = document.createElement('div');
        this.container.appendChild(this.element);
    }
    abstract append(text: string): void;
    abstract update(data: any): void;
}

class ContentSegment extends MessageSegment {
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

class ToolCallSegment extends MessageSegment {
    public toolCallId: string;
    public toolName: string;
    public displayMessage: string;
    private statusIcon: HTMLSpanElement | null = null;
    private statusText: HTMLSpanElement | null = null;
    private details: HTMLDetailsElement | null = null;
    private pre: HTMLPreElement | null = null;

    constructor(container: HTMLElement, payload: any) {
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

        const isOpen = this.toolName !== 'edit_file';
        this.element.innerHTML = `
            <details ${isOpen ? 'open' : ''}>
                <summary>
                    <span class="tool-call-status-icon">⚙️</span>
                    <span class="tool-status-text">${this.displayMessage}</span>
                </summary>
                <pre>${prettyArgs}</pre>
            </details>
        `;
        this.statusIcon = this.element.querySelector('.tool-call-status-icon');
        this.statusText = this.element.querySelector('.tool-status-text');
        this.details = this.element.querySelector('details');
        this.pre = this.element.querySelector('pre');
    }

    append() {}

    update(payload: any) {
        if (this.details) {
            this.details.removeAttribute('open');
        }
        if (this.statusIcon) {
            this.statusIcon.textContent = payload.success ? '✅' : '❌';
        }
        if (this.statusText) {
            let message = payload.customMessage || this.displayMessage;
            if (!message || message.includes('Running')) {
                message = `Used <span class="tool-name">${payload.toolName}</span>`;
            }
            this.statusText.innerHTML = message.replace(/\.+$/, '');
            if (!payload.success) {
                this.statusText.style.color = 'var(--vscode-errorForeground)';
            }
        }
        if (this.pre && payload.result) {
            this.pre.textContent = payload.result;
        }
    }
}

class ConfirmationSegment extends MessageSegment {
    public toolCallId: string;
    constructor(container: HTMLElement, payload: any) {
        super(container, 'confirmation');
        this.toolCallId = payload.toolCallId;
        this.element.className = 'tool-confirmation-container';
        this.element.id = 'confirm-' + this.toolCallId;
        this.element.innerHTML = `
            <div class="tool-confirmation-header">
                <span class="tool-confirmation-icon">ℹ️</span>
                <span>Tool Request</span>
            </div>
            <div class="tool-confirmation-message">${payload.message}</div>
            ${payload.diffData ? `
                <div style="margin-top: 8px; display: flex; justify-content: center;">
                    <button class="tool-button tool-button-secondary view-diff-btn" style="width: 100%; max-width: none;">🔍 View Diff</button>
                </div>
            ` : ''}
            <div class="tool-confirmation-buttons">
                <button class="tool-button tool-button-primary allow-btn">Allow</button>
                <button class="tool-button tool-button-secondary deny-btn">Deny</button>
            </div>
        `;

        this.element.querySelector('.allow-btn')?.addEventListener('click', () => {
            chatManager.confirmTool(this.toolCallId, 'allow');
        });
        this.element.querySelector('.deny-btn')?.addEventListener('click', () => {
            chatManager.confirmTool(this.toolCallId, 'deny');
        });
        this.element.querySelector('.view-diff-btn')?.addEventListener('click', () => {
            chatManager.viewDiff(this.toolCallId);
        });
    }

    append() {}
    update() {}
}

class ReasoningSegment extends MessageSegment {
    private contentElement: HTMLDivElement;
    private toggleIcon: HTMLSpanElement;
    public internalSegments: MessageSegment[] = [];
    private lastInternalTokenType: string | null = null;

    constructor(container: HTMLElement) {
        super(container, 'reasoning');
        this.element.className = 'reasoning-container';
        this.element.innerHTML = `
            <div class="reasoning-header">
                <span class="reasoning-toggle-icon">
                    <svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/>
                    </svg>
                </span>
                <span>Thought Process</span>
            </div>
            <div class="reasoning-content"></div>
        `;
        const content = this.element.querySelector('.reasoning-content');
        if (content instanceof HTMLDivElement) {
            this.contentElement = content;
        } else {
            throw new Error('Reasoning content element not found');
        }

        const icon = this.element.querySelector('.reasoning-toggle-icon');
        if (icon instanceof HTMLSpanElement) {
            this.toggleIcon = icon;
        } else {
            throw new Error('Reasoning toggle icon not found');
        }
        
        this.element.querySelector('.reasoning-header')?.addEventListener('click', () => {
            this.toggleReasoning();
        });
    }

    append(text: string) {
        if (this.lastInternalTokenType !== 'content' || !this.internalSegments.length) {
            const seg = new ContentSegment(this.contentElement);
            this.internalSegments.push(seg);
        }
        this.internalSegments[this.internalSegments.length - 1].append(text);
        this.lastInternalTokenType = 'content';
    }

    addToolCall(payload: any) {
        const seg = new ToolCallSegment(this.contentElement, payload);
        this.internalSegments.push(seg);
        this.lastInternalTokenType = 'tool_call';
        return seg;
    }

    addConfirmation(payload: any) {
        const seg = new ConfirmationSegment(this.contentElement, payload);
        this.internalSegments.push(seg);
        this.lastInternalTokenType = 'confirmation';
        return seg;
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

class AssistantMessage {
    private indicator: HTMLDivElement | null;
    private segments: MessageSegment[] = [];
    private toolCalls = new Map<string, ToolCallSegment>();
    private activeReasoningSegment: ReasoningSegment | null = null;
    private lastTokenType: string | null = null;
    public isStreaming = true;
    public element: HTMLDivElement;

    constructor(container: HTMLElement) {
        this.element = document.createElement('div');
        this.element.className = 'message assistant loading';
        this.element.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <span class="loading-text">Working...</span>
            </div>
        `;

        const ind = this.element.querySelector('.typing-indicator');
        this.indicator = ind instanceof HTMLDivElement ? ind : null;

        container.appendChild(this.element);
        this.element.scrollIntoView();
    }

    appendToken(text: string, tokenType: string) {
        if (tokenType === 'reasoning') {
            if (!this.activeReasoningSegment) {
                this.activeReasoningSegment = new ReasoningSegment(this.element);
                this.segments.push(this.activeReasoningSegment);
            }
            this.activeReasoningSegment.append(text);
        } else {
            // content
            if (this.activeReasoningSegment) {
                this.activeReasoningSegment.collapse();
                this.activeReasoningSegment = null;
            }
            if (this.lastTokenType !== 'content' || !this.segments.length) {
                const seg = new ContentSegment(this.element);
                this.segments.push(seg);
            }
            this.segments[this.segments.length - 1].append(text);
        }
        this.lastTokenType = tokenType;
    }

    addToolCall(payload: any) {
        let segment: ToolCallSegment;
        if (this.activeReasoningSegment) {
            segment = this.activeReasoningSegment.addToolCall(payload);
        } else {
            segment = new ToolCallSegment(this.element, payload);
            this.segments.push(segment);
        }
        this.toolCalls.set(payload.toolCallId, segment);
        this.lastTokenType = 'tool_call';
        segment.element.scrollIntoView();
    }

    updateToolCall(payload: any) {
        const segment = this.toolCalls.get(payload.toolCallId);
        if (segment) {
            segment.update(payload);
        }
    }

    addConfirmation(payload: any) {
        let segment: ConfirmationSegment;
        if (this.activeReasoningSegment) {
            segment = this.activeReasoningSegment.addConfirmation(payload);
        } else {
            segment = new ConfirmationSegment(this.element, payload);
            this.segments.push(segment);
        }
        this.lastTokenType = 'confirmation';
        segment.element.scrollIntoView();
    }

    finish() {
        this.isStreaming = false;
        this.element.classList.remove('loading');
        this.element.style.opacity = '1';
        if (this.indicator) {
            this.indicator.remove();
        }
        
        const hasContent = this.segments.some(s => {
            if (s instanceof ContentSegment) {
                return s.contentText.trim().length > 0;
            }
            if (s instanceof ReasoningSegment) {
                return s.internalSegments.some(is => {
                    if (is instanceof ContentSegment) {
                        return is.contentText.trim().length > 0;
                    }
                    return true;
                });
            }
            return true;
        });
        if (!hasContent) {
            this.element.remove();
        }
    }
}

class ChatManager {
    private chatContainer!: HTMLElement;
    private messageInput!: HTMLTextAreaElement;
    public currentAssistantMessage: AssistantMessage | null = null;
    private lastUserMessageElement: HTMLElement | null = null;

    init() {
        const chat = document.getElementById('chat');
        if (chat) {
            this.chatContainer = chat;
        } else {
            throw new Error('Chat container not found');
        }

        const input = document.getElementById('messageInput');
        if (input instanceof HTMLTextAreaElement) {
            this.messageInput = input;
        } else {
            throw new Error('Message input not found');
        }
        
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.messageInput.addEventListener('input', () => { this.adjustTextareaHeight(); });
        this.adjustTextareaHeight();
        this.messageInput.focus();

        window.addEventListener('focus', () => {
            setTimeout(() => { this.messageInput.focus(); }, 50);
        });

        this.setupModelSelector();
        this.setupMessageListener();
    }

    private setupModelSelector() {
        const modelSelector = document.getElementById('modelSelector');
        if (!modelSelector) {
            throw new Error('Model selector not found');
        }

        const dropdownLabel = modelSelector.querySelector('.dropdown-label');
        const dropdownContent = modelSelector.querySelector('.dropdown-content');
        const chatProfileLabel = modelSelector.querySelector('.chat-profile-label');
        const sendIcon = document.querySelector('.send-icon');

        if (!(dropdownLabel instanceof HTMLElement) || 
            !(dropdownContent instanceof HTMLElement) || 
            !(chatProfileLabel instanceof HTMLElement) || 
            !(sendIcon instanceof HTMLElement)) {
            throw new Error('Dropdown elements not found');
        }

        sendIcon.innerHTML = SEND_ICON_HTML;
        sendIcon.addEventListener('click', () => {
            if (this.messageInput.disabled) {
                this.cancelRequest();
            } else {
                this.sendMessage();
            }
        });

        const { profiles, activeProfile } = window.initialState;
        chatProfileLabel.textContent = activeProfile;

        profiles.forEach(profileId => {
            const option = document.createElement('a');
            option.href = '#';
            option.textContent = profileId;
            option.addEventListener('click', (e) => {
                e.preventDefault();
                chatProfileLabel.textContent = profileId;
                dropdownContent.style.display = 'none';
                vscode.postMessage({ 
                    command: WEBVIEW_COMMANDS.CHAT_PROFILE_CHANGED, 
                    model: profileId 
                });
            });
            dropdownContent.appendChild(option);
        });

        dropdownLabel.addEventListener('click', () => {
            dropdownContent.style.display = dropdownContent.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
            if (e.target instanceof Node && !modelSelector.contains(e.target)) {
                dropdownContent.style.display = 'none';
            }
        });
    }

    private setupMessageListener() {
        window.addEventListener('message', event => {
            const { sender, type, text, tokenType, command } = event.data;
            
            if (command === 'newChat') {
                this.newChat();
                return;
            }

            if (sender === 'assistant') {
                if (type === EXTENSION_EVENTS.TOKENS) {
                    if (!this.currentAssistantMessage || !this.currentAssistantMessage.isStreaming) {
                        this.currentAssistantMessage = new AssistantMessage(this.chatContainer);
                    }
                    this.currentAssistantMessage.appendToken(text, tokenType);
                    
                    if (this.lastUserMessageElement) {
                        const rect = this.lastUserMessageElement.getBoundingClientRect();
                        if (rect.top > 25) {
                            this.chatContainer.scrollTop += 20;
                        }
                    }
                } else if (type === EXTENSION_EVENTS.TOOL_START) {
                    if (!this.currentAssistantMessage || !this.currentAssistantMessage.isStreaming) {
                        this.currentAssistantMessage = new AssistantMessage(this.chatContainer);
                    }
                    this.currentAssistantMessage.addToolCall(event.data);
                } else if (type === EXTENSION_EVENTS.TOOL_END) {
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.updateToolCall(event.data);
                    }
                } else if (type === EXTENSION_EVENTS.REQUEST_CONFIRMATION) {
                    if (!this.currentAssistantMessage || !this.currentAssistantMessage.isStreaming) {
                        this.currentAssistantMessage = new AssistantMessage(this.chatContainer);
                    }
                    this.currentAssistantMessage.addConfirmation(event.data);
                } else if (type === EXTENSION_EVENTS.COMPLETION) {
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.finish();
                    }
                    this.enableInput();
                } else {
                    this.enableInput();
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.finish();
                    }
                    this.appendStaticAssistantMessage(text);
                }
            } else if (sender === 'user') {
                this.appendUserMessage(text);
            }
        });
    }

    sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text) {
            return;
        }

        const emptyChatContent = document.getElementById('emptyChatContent');
        if (emptyChatContent) {
            emptyChatContent.style.display = 'none';
        }

        this.appendUserMessage(text);
        this.messageInput.value = '';
        this.adjustTextareaHeight();
        
        this.currentAssistantMessage = new AssistantMessage(this.chatContainer);
        this.disableInput();
        
        vscode.postMessage({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text });
    }

    cancelRequest() {
        vscode.postMessage({ command: WEBVIEW_COMMANDS.CANCEL_REQUEST });
    }

    appendUserMessage(text: string) {
        const msg = document.createElement('div');
        msg.className = 'message user';
        msg.innerText = text;
        this.chatContainer.appendChild(msg);
        this.lastUserMessageElement = msg;
        msg.scrollIntoView();
    }

    appendStaticAssistantMessage(text: string) {
        const msg = document.createElement('div');
        msg.className = 'message assistant';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = window.renderMarkdown(text);
        msg.appendChild(content);
        this.chatContainer.appendChild(msg);
        msg.scrollIntoView();
    }

    private disableInput() {
        this.messageInput.disabled = true;
        this.messageInput.placeholder = '';
        const wrapper = document.querySelector('.input-wrapper');
        const sendIcon = document.querySelector('.send-icon');
        const indicator = document.getElementById('inputLoadingIndicator');
        
        if (wrapper instanceof HTMLElement) {
            wrapper.classList.add('waiting');
        }
        if (sendIcon instanceof HTMLElement) {
            sendIcon.innerHTML = STOP_ICON_HTML;
        }
        if (indicator instanceof HTMLElement) {
            indicator.classList.add('visible');
        }
    }

    private enableInput() {
        this.messageInput.disabled = false;
        this.messageInput.placeholder = 'Type a request...';
        const wrapper = document.querySelector('.input-wrapper');
        const sendIcon = document.querySelector('.send-icon');
        const indicator = document.getElementById('inputLoadingIndicator');
        
        if (wrapper instanceof HTMLElement) {
            wrapper.classList.remove('waiting');
        }
        if (sendIcon instanceof HTMLElement) {
            sendIcon.innerHTML = SEND_ICON_HTML;
        }
        if (indicator instanceof HTMLElement) {
            indicator.classList.remove('visible');
        }
    }

    private adjustTextareaHeight() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
    }

    newChat() {
        const messages = this.chatContainer.querySelectorAll('.message, .tool-call-container, .tool-confirmation-container');
        messages.forEach(m => { m.remove(); });
        const emptyChatContent = document.getElementById('emptyChatContent');
        if(emptyChatContent) {
            emptyChatContent.style.display = 'flex';
        }
        this.currentAssistantMessage = null;
    }

    confirmTool(toolCallId: string, decision: string) {
        const container = document.getElementById('confirm-' + toolCallId);
        if (container) {
            container.remove();
        }
        vscode.postMessage({ command: WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL, toolCallId, decision });
    }

    viewDiff(toolCallId: string) {
        vscode.postMessage({ command: WEBVIEW_COMMANDS.VIEW_DIFF, toolCallId });
    }
}

const chatManager = new ChatManager();
document.addEventListener('DOMContentLoaded', () => { chatManager.init(); });
