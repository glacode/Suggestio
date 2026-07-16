import { WEBVIEW_COMMANDS, EXTENSION_EVENTS, EXTENSION_COMMANDS, MESSAGE_SENDERS } from '../constants/protocol.js';
import { SettingsOverlay } from './settingsOverlay.js';
import { HistoryOverlay } from './historyOverlay.js';
import type { IWebviewApi, InitialState, ToolCallDecision, IChatManagerActions } from '../types.js';

// These are provided by the environment (main.ts)
declare const window: Window & { 
    renderMarkdown: (text: string) => string;
};

const SEND_ICON_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="7" y2="12"></line><polygon points="22 12 2 2 7 12 2 22 22 12"></polygon></svg>';
const STOP_ICON_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>';

export abstract class MessageSegment {
    public element: HTMLDivElement;
    constructor(protected container: HTMLElement, public type: string) {
        this.element = document.createElement('div');
        this.container.appendChild(this.element);
    }
    abstract append(text: string): void;
    abstract update(data: any): void;
}

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

export class ToolCallSegment extends MessageSegment {
    public toolCallId: string;
    public toolName: string;
    public displayMessage: string;
    private statusIcon: HTMLSpanElement | null = null;
    private statusText: HTMLSpanElement | null = null;
    private details: HTMLDetailsElement | null = null;
    private pre: HTMLPreElement | null = null;
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
        this.element.innerHTML = `
            <details ${isOpen ? 'open' : ''}>
                <summary>
                    <span class="tool-call-status-icon">⚙️</span>
                    <span class="tool-status-text">${this.displayMessage}</span>
                </summary>
                <pre>${prettyArgs}</pre>
                <div class="tool-output"></div>
            </details>
        `;
        this.statusIcon = this.element.querySelector('.tool-call-status-icon');
        this.statusText = this.element.querySelector('.tool-status-text');
        this.details = this.element.querySelector('details');
        this.pre = this.element.querySelector('pre');
        this.outputContainer = this.element.querySelector('.tool-output');

        // Ensure that when the tool details are expanded or collapsed,
        // we adjust the scroll position to keep the content visible.
        if (this.details) {
            this.details.addEventListener('toggle', () => {
                this.chatManager.scrollToBottom();
            });
        }
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
        if (this.statusIcon) {
            // Replace gear icon with spinning SVG circle
            const spinnerSvg = `<svg class="tool-spinner" width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 4" />
            </svg>`;
            this.statusIcon.innerHTML = spinnerSvg;
            this.statusIcon.classList.add('spinning');
        }
    }

    append() {}

    update(payload: any) {
        if (this.details) {
            this.details.removeAttribute('open');
        }
        if (this.statusIcon) {
            this.statusIcon.textContent = payload.success ? '✅' : '❌';
            this.statusIcon.classList.remove('spinning');
        }
        if (this.statusText) {
            let message = payload.customMessage || this.displayMessage;
            if (!message || message.includes('Running')) {
                message = `Used <span class="tool-name">${payload.toolName}</span>`;
            }
            this.statusText.innerHTML = message.replace(/\.+$/, '');
            if (!payload.success) {
                this.statusText.classList.add('validation-error');
            }
        }
        if (this.pre && payload.result) {
            this.pre.textContent = payload.result;
        }

        // Remove the tool output container upon tool completion to free memory.
        if (this.outputContainer) {
            this.outputContainer.remove();
            this.outputContainer = null;
        }
    }
}

export class ConfirmationSegment extends MessageSegment {
    public toolCallId: string;
    constructor(private chatManager: IChatManagerActions, container: HTMLElement, payload: any) {
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
                <div class="mt-8 flex-center">
                    <button class="tool-button tool-button-secondary view-diff-btn full-width">🔍 View Diff</button>
                </div>
            ` : ''}
            <div class="tool-confirmation-buttons">
                <button class="tool-button tool-button-primary allow-btn">Allow</button>
                ${payload.diffData || payload.toolName === 'run_command' ? `<button class="tool-button tool-button-secondary always-allow-btn" data-tooltip="${payload.diffData ? 'Enable auto-accept for all edits in this session' : 'Always allow this exact command in this session'}">Always Allow</button>` : ''}
                <button class="tool-button tool-button-secondary deny-btn">Deny</button>
            </div>
        `;

        this.element.querySelector('.allow-btn')?.addEventListener('click', () => {
            this.chatManager.confirmTool(this.toolCallId, 'allow');
        });
        
        const alwaysAllowBtn = this.element.querySelector('.always-allow-btn');
        if (alwaysAllowBtn) {
            alwaysAllowBtn.addEventListener('click', () => {
                const decision: ToolCallDecision = payload.diffData ? 'always-allow-edit' : (payload.toolName === 'run_command' ? 'always-allow-command' : 'always-allow-edit');
                this.chatManager.confirmTool(this.toolCallId, decision);
            });
        }

        this.element.querySelector('.deny-btn')?.addEventListener('click', () => {
            this.chatManager.confirmTool(this.toolCallId, 'deny');
        });
        this.element.querySelector('.view-diff-btn')?.addEventListener('click', () => {
            this.chatManager.viewDiff(this.toolCallId);
        });
    }

    append() {}
    update() {}
}

export class ReasoningSegment extends MessageSegment {
    private contentElement: HTMLDivElement;
    private toggleIcon: HTMLSpanElement;
    public internalSegments: MessageSegment[] = [];
    private lastInternalTokenType: string | null = null;

    constructor(private chatManager: IChatManagerActions, container: HTMLElement) {
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
        const seg = new ToolCallSegment(this.chatManager, this.contentElement, payload);
        this.internalSegments.push(seg);
        this.lastInternalTokenType = 'tool_call';
        return seg;
    }

    addConfirmation(payload: any) {
        const seg = new ConfirmationSegment(this.chatManager, this.contentElement, payload);
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

export class AssistantMessage {
    private indicator: HTMLDivElement | null;
    private segments: MessageSegment[] = [];
    private toolCalls = new Map<string, ToolCallSegment>();
    private activeReasoningSegment: ReasoningSegment | null = null;
    private lastTokenType: string | null = null;
    public isStreaming = true;
    public element: HTMLDivElement;

    constructor(private chatManager: IChatManagerActions, container: HTMLElement) {
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
                this.activeReasoningSegment = new ReasoningSegment(this.chatManager, this.element);
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
            segment = new ToolCallSegment(this.chatManager, this.element, payload);
            this.segments.push(segment);
        }
        this.toolCalls.set(payload.toolCallId, segment);
        this.lastTokenType = 'tool_call';
        segment.element.scrollIntoView();
    }

    appendToolOutput(payload: any) {
        const segment = this.toolCalls.get(payload.toolCallId);
        if (segment) {
            segment.appendOutput(payload.output);
        }
    }

    updateToolCall(payload: any) {
        const segment = this.toolCalls.get(payload.toolCallId);
        if (segment) {
            segment.update(payload);
        }

        // Surgically remove any confirmation UI associated with this tool call.
        this.removeConfirmations(payload.toolCallId);
    }

    addConfirmation(payload: any) {
        let segment: ConfirmationSegment;
        if (this.activeReasoningSegment) {
            segment = this.activeReasoningSegment.addConfirmation(payload);
        } else {
            segment = new ConfirmationSegment(this.chatManager, this.element, payload);
            this.segments.push(segment);
        }
        this.lastTokenType = 'confirmation';
        segment.element.scrollIntoView();
    }

    /**
     * Surgically removes confirmation segments from this message.
     * @param toolCallId Optional. If provided, only removes the confirmation for that specific tool call.
     *                   If omitted, removes ALL confirmation segments from the message.
     */
    private removeConfirmations(toolCallId?: string) {
        // Helper function to filter a segments array (handles recursion for ReasoningSegments)
        const filterSegments = (segments: MessageSegment[]): MessageSegment[] => {
            return segments.filter(s => {
                if (s instanceof ConfirmationSegment) {
                    if (!toolCallId || s.toolCallId === toolCallId) {
                        s.element.remove();
                        return false;
                    }
                } else if (s instanceof ReasoningSegment) {
                    s.internalSegments = filterSegments(s.internalSegments);
                }
                return true;
            });
        };

        this.segments = filterSegments(this.segments);
    }

    getToolCall(toolCallId: string): ToolCallSegment | undefined {
        return this.toolCalls.get(toolCallId);
    }

    showError(text: string) {
        this.isStreaming = false;
        this.element.classList.remove('loading');
        this.element.classList.add('error');
        if (this.indicator) {
            this.indicator.remove();
        }

        // Clean up confirmations if an error occurred
        this.removeConfirmations();

        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-container';
        errorContainer.innerHTML = `
            <div class="error-message">
                <span>${window.renderMarkdown('⚠️ ' + text)}</span>
            </div>
            <button class="retry-button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 18 10"></polyline><polyline points="1 20 1 14 6 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                Retry
            </button>
        `;

        errorContainer.querySelector('.retry-button')?.addEventListener('click', () => {
            this.chatManager.retryLastMessage();
        });

        this.element.appendChild(errorContainer);
        this.chatManager.scrollToBottom(true);
    }

    /**
     * Displays a warning state when the agent reaches a logical limit (like max iterations).
     * Provides a "Continue" button to let the user proceed with the current task.
     * @param text The message explaining why the agent stopped.
     */
    showHalted(text: string) {
        this.isStreaming = false;
        this.element.classList.remove('loading');
        this.element.classList.add('halted');
        if (this.indicator) {
            this.indicator.remove();
        }

        // Clean up confirmations if agent halted
        this.removeConfirmations();

        const haltedContainer = document.createElement('div');
        haltedContainer.className = 'halted-container';
        haltedContainer.innerHTML = `
            <div class="halted-message">
                <span class="halted-icon">⏳</span>
                <span>${window.renderMarkdown(text)}</span>
            </div>
            <button class="continue-button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Continue
            </button>
        `;

        haltedContainer.querySelector('.continue-button')?.addEventListener('click', () => {
            this.chatManager.retryLastMessage();
        });

        this.element.appendChild(haltedContainer);
        this.chatManager.scrollToBottom(true);
    }

    /**
     * Surgically removes error or halted containers and resets the state to loading
     * for a clean resumption of the agent loop.
     */
    prepareForResumption() {
        this.isStreaming = true;
        this.element.classList.remove('error', 'halted');
        this.element.classList.add('loading');

        // Remove the error or halted container if it exists
        this.element.querySelector('.error-container')?.remove();
        this.element.querySelector('.halted-container')?.remove();

        // Re-add the indicator if it was removed
        if (!this.indicator) {
            this.indicator = document.createElement('div');
            this.indicator.className = 'typing-indicator';
            this.indicator.innerHTML = `
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <span class="loading-text">Working...</span>
            `;
            this.element.appendChild(this.indicator);
        } else if (!this.element.contains(this.indicator)) {
            this.element.appendChild(this.indicator);
        }
        
        this.chatManager.scrollToBottom(true);
    }

    finish() {
        this.isStreaming = false;
        this.element.classList.remove('loading');
        this.element.classList.add('visible');
        if (this.indicator) {
            this.indicator.remove();
        }

        // Clean up any lingering confirmation segments when the turn finishes.
        this.removeConfirmations();

        this.chatManager.scrollToBottom(true);
        
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

/**
 * Main manager for the Chat Webview UI.
 */
export class ChatManager implements IChatManagerActions {
    private chatContainer!: HTMLElement;
    private messageInput!: HTMLTextAreaElement;
    public currentAssistantMessage: AssistantMessage | null = null;
    private currentNotification: HTMLElement | null = null;

    /**
     * @param vscode The VS Code Webview API instance.
     * @param initialState The initial configuration data passed from the extension.
     * @param settingsOverlay The settings overlay manager.
     * @param historyOverlay The history overlay manager.
     */
    constructor(
        private vscode: IWebviewApi,
        private initialState: InitialState,
        private settingsOverlay: SettingsOverlay,
        private historyOverlay: HistoryOverlay
    ) {}

    /**
     * Initializes the UI components and event listeners.
     */
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

        this.setupProfileSelector();
        // Initialize overlays attached to the full webview (body)
        try {
            const root = document.querySelector('.chat-container') || document.body;
            if (root instanceof HTMLElement) {
                this.settingsOverlay.init(root);
                this.historyOverlay.init(root);
            } else {
                this.settingsOverlay.init(document.body);
                this.historyOverlay.init(document.body);
            }
        } catch (e) {
            console.warn('Failed to init overlays', e);
        }
        this.setupMessageListener();
    }

    private setupProfileSelector() {
        const modelSelector = document.getElementById('modelSelector');
        if (!modelSelector) {
            throw new Error('Model selector not found');
        }

        const dropdownLabel = modelSelector.querySelector('.dropdown-label');
        const sendIcon = document.querySelector('.send-icon');

        if (!(dropdownLabel instanceof HTMLElement) || 
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

        const { chatProfileIds, activeChatProfileId } = this.initialState;
        this.renderProfileSelector(chatProfileIds, activeChatProfileId);

        dropdownLabel.addEventListener('click', () => {
            const dropdownContent = modelSelector.querySelector('.dropdown-content');
            if (dropdownContent instanceof HTMLElement) {
                dropdownContent.classList.toggle('show');
            }
        });

        document.addEventListener('click', (e) => {
            const dropdownContent = modelSelector.querySelector('.dropdown-content');
            if (dropdownContent instanceof HTMLElement && e.target instanceof Node && !modelSelector.contains(e.target)) {
                dropdownContent.classList.remove('show');
            }
        });
    }

    private renderProfileSelector(chatProfileIds: string[], activeChatProfileId: string) {
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

    private openSettings() {
        if (this.settingsOverlay.isVisible()) {
            this.settingsOverlay.hide();
        } else {
            // Populate overlay with profile settings then show it
            try {
                this.settingsOverlay.render(this.vscode, this.initialState);
            } catch (e) { }
            this.settingsOverlay.show();
            this.historyOverlay.hide();
        }
    }

    private setupMessageListener() {
        window.addEventListener('message', event => {
            const { sender, type, text, tokenType, command } = event.data;

            // Handle extension-initiated commands
            if (command === EXTENSION_COMMANDS.NEW_CHAT) {
                this.newChat();
                return;
            }
            if (command === EXTENSION_COMMANDS.OPEN_SETTINGS) {
                this.openSettings();
                return;
            }
            if (command === EXTENSION_COMMANDS.OPEN_HISTORY) {
                if (this.historyOverlay.isVisible()) {
                    this.historyOverlay.hide();
                } else {
                    this.vscode.postMessage({ command: WEBVIEW_COMMANDS.GET_SESSIONS });
                    this.historyOverlay.show();
                    this.settingsOverlay.hide();
                }
                return;
            }

            if (type === EXTENSION_EVENTS.SESSIONS_LIST) {
                this.historyOverlay.render(this.vscode, event.data.sessions);
                return;
            }

            if (type === EXTENSION_EVENTS.CHAT_HISTORY_LOADED) {
                // Hide loading spinner
                const loadingOverlay = document.getElementById('loadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.classList.remove('visible');
                }
                this.loadHistory(event.data.history);
                return;
            }

            if (type === EXTENSION_EVENTS.UPDATE_PROFILE_METADATA) {
                this.initialState.profileMetadata = event.data.metadata;
                if (event.data.profiles) {
                    this.initialState.chatProfileIds = event.data.profiles;
                }
                if (event.data.activeProfile) {
                    this.initialState.activeChatProfileId = event.data.activeProfile;
                }

                try {
                    this.settingsOverlay.render(this.vscode, this.initialState);
                    // Update dropdown if full profile list is provided
                    if (event.data.profiles && event.data.activeProfile) {
                        this.renderProfileSelector(event.data.profiles, event.data.activeProfile);
                    }
                } catch (e) { }
                return;
            }

            if (sender === MESSAGE_SENDERS.ASSISTANT) {
                if (type === EXTENSION_EVENTS.NOTIFICATION) {
                    // text === null means hide notification
                    if (text === null) {
                        this.removeNotification();
                    } else {
                        this.showNotification(text);
                    }
                    return;
                } else if (type === EXTENSION_EVENTS.TOKENS) {
                    if (!this.currentAssistantMessage || !this.currentAssistantMessage.isStreaming) {
                        this.currentAssistantMessage = new AssistantMessage(this, this.chatContainer);
                    }
                    this.currentAssistantMessage.appendToken(text, tokenType);
                    
                    // Auto-scroll to bottom to keep the streaming token in view.
                    this.scrollToBottom();
                } else if (type === EXTENSION_EVENTS.TOOL_START) {
                    if (!this.currentAssistantMessage || !this.currentAssistantMessage.isStreaming) {
                        this.currentAssistantMessage = new AssistantMessage(this, this.chatContainer);
                    }
                    this.currentAssistantMessage.addToolCall(event.data);
                    this.scrollToBottom();
                } else if (type === EXTENSION_EVENTS.TOOL_STARTED) {
                    // Trigger the spinner when the backend confirms the tool has officially started executing.
                    if (this.currentAssistantMessage) {
                        const toolSegment = this.currentAssistantMessage.getToolCall(event.data.toolCallId);
                        if (toolSegment) {
                            toolSegment.startSpinner();
                        }
                    }
                } else if (type === EXTENSION_EVENTS.TOOL_OUTPUT) {
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.appendToolOutput(event.data);
                        this.scrollToBottom();
                    }
                } else if (type === EXTENSION_EVENTS.TOOL_END) {
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.updateToolCall(event.data);
                        this.scrollToBottom();
                    }
                } else if (type === EXTENSION_EVENTS.REQUEST_CONFIRMATION) {
                    if (!this.currentAssistantMessage || !this.currentAssistantMessage.isStreaming) {
                        this.currentAssistantMessage = new AssistantMessage(this, this.chatContainer);
                    }
                    this.currentAssistantMessage.addConfirmation(event.data);
                    this.scrollToBottom();
                } else if (type === EXTENSION_EVENTS.COMPLETION) {
                    this.removeNotification();
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.finish();
                    }
                    this.enableInput();
                } else if (type === EXTENSION_EVENTS.ERROR) {
                    // Hide loading spinner on error
                    const loadingOverlay = document.getElementById('loadingOverlay');
                    if (loadingOverlay) {
                        loadingOverlay.classList.remove('visible');
                    }
                    this.removeNotification();
                    this.enableInput();
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.showError(text);
                    } else {
                        this.appendStaticAssistantMessage(text);
                    }
                    this.scrollToBottom(true);
                } else if (type === EXTENSION_EVENTS.HALTED) {
                    this.removeNotification();
                    this.enableInput();
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.showHalted(text);
                    } else {
                        this.appendStaticAssistantMessage(text);
                    }
                    this.scrollToBottom(true);
                } else {
                    this.removeNotification();
                    this.enableInput();
                    if (this.currentAssistantMessage) {
                        this.currentAssistantMessage.finish();
                    }
                    this.appendStaticAssistantMessage(text);
                }
            } else if (sender === MESSAGE_SENDERS.USER) {
                this.appendUserMessage(text);
            }
        });
    }

    /**
     * Scrolls the chat container to the bottom if the user is already near the bottom
     * or if forced. This ensures that streaming responses stay in view without
     * jarring the user if they have manually scrolled up to read previous messages.
     * @param force Whether to scroll to the bottom regardless of current scroll position.
     */
    public scrollToBottom(force = false) {
        if (!this.chatContainer) { return; }

        // The distance (in pixels) from the bottom of the container.
        // If the user is within this threshold, we assume they want to follow the stream.
        // We use a threshold of 250 to account for tool output expansions (180px).
        const threshold = 250; 
        const isNearBottom = (this.chatContainer.scrollHeight - this.chatContainer.scrollTop - this.chatContainer.clientHeight) < threshold;

        if (force || isNearBottom) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }

    sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text) {
            return;
        }

        this.clearStaleButtons();

        const emptyChatContent = document.getElementById('emptyChatContent');
        if (emptyChatContent) {
            emptyChatContent.classList.remove('show-flex');
            emptyChatContent.classList.add('hidden');
        }

        this.appendUserMessage(text);
        this.messageInput.value = '';
        this.adjustTextareaHeight();
        
        this.currentAssistantMessage = new AssistantMessage(this, this.chatContainer);
        this.disableInput();
        
        this.vscode.postMessage({ command: WEBVIEW_COMMANDS.SEND_MESSAGE, text });
    }

    private clearStaleButtons() {
        // Remove error and halted containers
        const containers = this.chatContainer.querySelectorAll('.error-container, .halted-container');
        containers.forEach(container => container.remove());

        // Remove error and halted classes from assistant message bubbles to reset their styling
        const assistantMessages = this.chatContainer.querySelectorAll('.message.assistant.error, .message.assistant.halted');
        assistantMessages.forEach(msg => {
            msg.classList.remove('error', 'halted');
        });
    }

    cancelRequest() {
        this.vscode.postMessage({ command: WEBVIEW_COMMANDS.CANCEL_REQUEST });
    }

    retryLastMessage() {
        if (this.currentAssistantMessage) {
            this.currentAssistantMessage.prepareForResumption();
        } else {
            // Fallback if somehow currentAssistantMessage was lost
            this.currentAssistantMessage = new AssistantMessage(this, this.chatContainer);
        }
        
        this.disableInput();
        this.vscode.postMessage({ command: WEBVIEW_COMMANDS.RETRY_LAST_MESSAGE });
    }

    appendUserMessage(text: string) {
        const msg = document.createElement('div');
        msg.className = 'message user';
        msg.innerText = text;
        this.chatContainer.appendChild(msg);
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
            emptyChatContent.classList.remove('hidden');
            emptyChatContent.classList.add('show-flex');
        }
        this.removeNotification();
        this.currentAssistantMessage = null;
    }

    loadHistory(history: any[]) {
        this.newChat();
        const emptyChatContent = document.getElementById('emptyChatContent');
        if (emptyChatContent) {
            emptyChatContent.classList.remove('show-flex');
            emptyChatContent.classList.add('hidden');
        }

        history.forEach(msg => {
            if (msg.role === 'user') {
                if (this.currentAssistantMessage) {
                    this.currentAssistantMessage.finish();
                    this.currentAssistantMessage = null;
                }
                this.appendUserMessage(msg.content);
            } else if (msg.role === 'assistant') {
                if (!this.currentAssistantMessage) {
                    this.currentAssistantMessage = new AssistantMessage(this, this.chatContainer);
                }
                
                if (msg.reasoning) {
                    this.currentAssistantMessage.appendToken(msg.reasoning, 'reasoning');
                }

                if (msg.content) {
                    this.currentAssistantMessage.appendToken(msg.content, 'content');
                }

                if (msg.tool_calls) {
                    msg.tool_calls.forEach((tc: any) => {
                        this.currentAssistantMessage!.addToolCall({
                            toolCallId: tc.id,
                            toolName: tc.function.name,
                            args: tc.function.arguments,
                            displayMessage: tc.displayMessage,
                            uiOptions: tc.uiOptions
                        });
                        // Find matching tool result
                        const toolResult = history.find(m => m.role === 'tool' && m.tool_call_id === tc.id);
                        if (toolResult) {
                            this.currentAssistantMessage!.updateToolCall({
                                toolCallId: tc.id,
                                toolName: tc.function.name,
                                success: toolResult.metadata?.toolCallSuccess ?? true,
                                result: toolResult.content,
                                customMessage: tc.displayMessage
                            });
                        }
                    });
                }
            }
        });

        if (this.currentAssistantMessage) {
            this.currentAssistantMessage.finish();
            this.currentAssistantMessage = null;
        }
    }

    private showNotification(text: string) {
        this.removeNotification(); // Remove any existing notification
        const notification = document.createElement('div');
        notification.className = 'message notification';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = window.renderMarkdown(text);
        notification.appendChild(content);
        this.chatContainer.appendChild(notification);
        notification.scrollIntoView();
        this.currentNotification = notification;
    }

    private removeNotification() {
        if (this.currentNotification) {
            this.currentNotification.remove();
            this.currentNotification = null;
        }
    }

    confirmTool(toolCallId: string, decision: ToolCallDecision) {
        const container = document.getElementById('confirm-' + toolCallId);
        if (container) {
            container.remove();
        }
        
        this.vscode.postMessage({ command: WEBVIEW_COMMANDS.CONFIRM_TOOL_CALL, toolCallId, decision });
    }

    viewDiff(toolCallId: string) {
        this.vscode.postMessage({ command: WEBVIEW_COMMANDS.VIEW_DIFF, toolCallId });
    }
}
