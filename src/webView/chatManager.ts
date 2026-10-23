import { WEBVIEW_COMMANDS, EXTENSION_EVENTS, EXTENSION_COMMANDS, MESSAGE_SENDERS } from '../constants/protocol.js';
import { SettingsOverlay } from './settingsOverlay.js';
import { HistoryOverlay } from './historyOverlay.js';
import type { IWebviewApi, InitialState, ToolCallDecision, IChatManagerActions } from '../types.js';
import { AssistantMessage } from './assistantMessage.js';
import { ProfileSelector } from './profileSelector.js';

// These are provided by the environment (main.ts)
declare const window: Window & { 
    renderMarkdown: (text: string) => string;
};

const SEND_ICON_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="7" y2="12"></line><polygon points="22 12 2 2 7 12 2 22 22 12"></polygon></svg>';
const STOP_ICON_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>';

/**
 * Main manager for the Chat Webview UI.
 */
export class ChatManager implements IChatManagerActions {
    private chatContainer!: HTMLElement;
    private messageInput!: HTMLTextAreaElement;
    public currentAssistantMessage: AssistantMessage | null = null;
    private currentNotification: HTMLElement | null = null;
    // init() registers three listeners on the shared global event targets
    // (window 'message'/'focus', document 'click'). They were previously
    // anonymous arrow functions that could never be unregistered. They are
    // stored as named handlers — here and in ProfileSelector — so that
    // dispose() can detach exactly what init() attached. This is
    // behavior-neutral.
    private handleMessage: ((event: MessageEvent) => void) | null = null;
    private readonly profileSelector: ProfileSelector;
    private readonly handleWindowFocus = () => {
        setTimeout(() => { this.messageInput.focus(); }, 50);
    };

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
    ) {
        this.profileSelector = new ProfileSelector(vscode, () => this.openSettings());
    }

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

        // Same handler as before — moved to a named field so dispose() can
        // remove it; the 50ms refocus behavior is unchanged.
        window.addEventListener('focus', this.handleWindowFocus);

        this.setupProfileSelector();
        this.setupSendButton();
        // Initialize overlays attached to the full webview (body)
        try {
            const candidate = document.querySelector('.chat-container');
            const root = candidate instanceof HTMLElement ? candidate : document.body;
            this.settingsOverlay.init(root);
            this.historyOverlay.init(root);
        } catch (e) {
            console.warn('Failed to init overlays', e);
        }
        this.setupMessageListener();
    }

    /**
     * Removes the three global listeners that init() attached. The tests call
     * this after every test so one ChatManager instance cannot leak handlers
     * into the next; in production it is safe to call on teardown.
     */
    dispose() {
        if (this.handleMessage) {
            window.removeEventListener('message', this.handleMessage);
        }
        window.removeEventListener('focus', this.handleWindowFocus);
        this.profileSelector.dispose();
    }

    private setupProfileSelector() {
        this.profileSelector.init();

        const { chatProfileIds, activeChatProfileId } = this.initialState;
        this.profileSelector.render(chatProfileIds, activeChatProfileId);
    }

    private setupSendButton() {
        const sendIcon = document.querySelector('.send-icon');

        if (!(sendIcon instanceof HTMLElement)) {
            throw new Error('Send button not found');
        }

        sendIcon.innerHTML = SEND_ICON_HTML;
        sendIcon.addEventListener('click', () => {
            if (this.messageInput.disabled) {
                this.cancelRequest();
            } else {
                this.sendMessage();
            }
        });
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
        // Same handler body as before; it is assigned to a field so dispose()
        // can reference the exact function when unregistering it.
        this.handleMessage = event => {
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
                // Yield control to the browser to allow it to paint the visible loading overlay.
                // Since loadHistory blocks the main thread during rendering, yielding ensures
                // the user sees the spinner while rendering is in progress.
                setTimeout(() => {
                    this.loadHistory(event.data.history);
                    // Hide loading spinner
                    const loadingOverlay = document.getElementById('loadingOverlay');
                    if (loadingOverlay) {
                        loadingOverlay.classList.remove('visible');
                    }
                }, 50);
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
                        this.profileSelector.render(event.data.profiles, event.data.activeProfile);
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
        };
        window.addEventListener('message', this.handleMessage);
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
            // If input is empty, check if we have history to continue from
            const hasHistory = this.chatContainer.querySelectorAll('.message, .tool-call-container, .tool-confirmation-container').length > 0;
            if (hasHistory) {
                this.clearStaleButtons();

                const emptyChatContent = document.getElementById('emptyChatContent');
                if (emptyChatContent) {
                    emptyChatContent.classList.remove('show-flex');
                    emptyChatContent.classList.add('hidden');
                }

                this.currentAssistantMessage = new AssistantMessage(this, this.chatContainer);
                this.disableInput();

                this.vscode.postMessage({ command: WEBVIEW_COMMANDS.CONTINUE_GENERATION });
            }
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
