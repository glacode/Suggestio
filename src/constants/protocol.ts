/**
 * Commands sent from the Webview UI to the Extension backend.
 */
export const WEBVIEW_COMMANDS = {
    SEND_MESSAGE: 'sendMessage',
    CHAT_PROFILE_CHANGED: 'chatProfileChanged',
    COMPLETION_PROFILE_CHANGED: 'completionProfileChanged',
    CLEAR_HISTORY: 'clearHistory',
    VIEW_DIFF: 'viewDiff',
    CONFIRM_TOOL_CALL: 'confirmToolCall',
    CANCEL_REQUEST: 'cancelRequest',
    EDIT_API_KEY: 'editApiKey',
    DELETE_API_KEY: 'deleteApiKey',
    RETRY_LAST_MESSAGE: 'retryLastMessage',
} as const;

/**
 * Commands sent from the Extension backend to the Webview UI.
 */
export const EXTENSION_COMMANDS = {
    NEW_CHAT: 'newChat',
    OPEN_SETTINGS: 'openSettings',
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
    TOOL_OUTPUT: 'agent:toolOutput',
    TOOL_END: 'agent:toolEnd',
    REQUEST_CONFIRMATION: 'agent:requestConfirmation',
    NOTIFICATION: 'notification',
    UPDATE_PROFILE_METADATA: 'updateProfileMetadata',
} as const;

/**
 * Message senders for chat communication.
 */
export const MESSAGE_SENDERS = {
    ASSISTANT: 'assistant',
    USER: 'user',
} as const;

export type WebviewCommand = typeof WEBVIEW_COMMANDS[keyof typeof WEBVIEW_COMMANDS];
export type ExtensionCommand = typeof EXTENSION_COMMANDS[keyof typeof EXTENSION_COMMANDS];
export type ExtensionEvent = typeof EXTENSION_EVENTS[keyof typeof EXTENSION_EVENTS];
export type MessageSender = typeof MESSAGE_SENDERS[keyof typeof MESSAGE_SENDERS];
