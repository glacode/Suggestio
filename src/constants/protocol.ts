/**
 * Commands sent from the Webview UI to the Extension backend.
 */
export const WEBVIEW_COMMANDS = {
    SEND_MESSAGE: 'sendMessage',
    CHAT_PROFILE_CHANGED: 'chatProfileChanged',
    CLEAR_HISTORY: 'clearHistory',
    VIEW_DIFF: 'viewDiff',
    CONFIRM_TOOL_CALL: 'confirmToolCall',
    CANCEL_REQUEST: 'cancelRequest',
} as const;

/**
 * Event types sent from the Extension backend to the Webview UI.
 */
export const EXTENSION_EVENTS = {
    CHAT_HISTORY_LOADED: 'chatHistoryLoaded',
    TOKENS: 'tokens',
    COMPLETION: 'completion',
    ERROR: 'error',
    ANONYMIZATION: 'anonymization',
    TOOL_START: 'agent:toolStart',
    TOOL_END: 'agent:toolEnd',
    REQUEST_CONFIRMATION: 'agent:requestConfirmation',
} as const;

export type WebviewCommand = typeof WEBVIEW_COMMANDS[keyof typeof WEBVIEW_COMMANDS];
export type ExtensionEvent = typeof EXTENSION_EVENTS[keyof typeof EXTENSION_EVENTS];
