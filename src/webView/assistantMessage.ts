import { MessageSegment } from './messageSegment.js';
import { ContentSegment } from './contentSegment.js';
import { ToolCallSegment } from './toolCallSegment.js';
import { ConfirmationSegment } from './confirmationSegment.js';
import { ReasoningSegment } from './reasoningSegment.js';
import type { IChatManagerActions } from '../types.js';

// These are provided by the environment (main.ts)
declare const window: Window & {
    renderMarkdown: (text: string) => string;
};

export class AssistantMessage {
    private typingIndicator: HTMLDivElement;
    private segments: MessageSegment[] = [];
    private toolCalls = new Map<string, ToolCallSegment>();
    private activeReasoningSegment: ReasoningSegment | null = null;
    private lastTokenType: string | null = null;
    public isStreaming = true;
    public element: HTMLDivElement;

    constructor(private chatManager: IChatManagerActions, container: HTMLElement) {
        this.element = document.createElement('div');
        this.element.className = 'message assistant loading';

        this.typingIndicator = document.createElement('div');
        this.typingIndicator.className = 'typing-indicator';
        this.typingIndicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <span class="loading-text">Working...</span>
        `;
        this.element.appendChild(this.typingIndicator);

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
                const contentSegment = new ContentSegment(this.element);
                this.segments.push(contentSegment);
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
        const filterSegments = (messageSegments: MessageSegment[]): MessageSegment[] => {
            return messageSegments.filter(messageSegment => {
                if (messageSegment instanceof ConfirmationSegment) {
                    if (!toolCallId || messageSegment.toolCallId === toolCallId) {
                        messageSegment.element.remove();
                        return false;
                    }
                } else if (messageSegment instanceof ReasoningSegment) {
                    messageSegment.internalSegments = filterSegments(messageSegment.internalSegments);
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
        if (this.typingIndicator) {
            this.typingIndicator.remove();
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
        if (this.typingIndicator) {
            this.typingIndicator.remove();
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

        // Re-attach the typing indicator if it was removed from the DOM
        if (!this.element.contains(this.typingIndicator)) {
            this.element.appendChild(this.typingIndicator);
        }
        
        this.chatManager.scrollToBottom(true);
    }

    finish() {
        this.isStreaming = false;
        this.element.classList.remove('loading');
        this.element.classList.add('visible');
        if (this.typingIndicator) {
            this.typingIndicator.remove();
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
