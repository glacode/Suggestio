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
    GET_SESSIONS: 'getSessions',
    LOAD_SESSION: 'loadSession',
    ADD_PROFILE: 'addProfile',
    DELETE_PROFILE: 'deleteProfile',
} as const;

/**
 * Commands sent from the Extension backend to the Webview UI.
 */
export const EXTENSION_COMMANDS = {
    NEW_CHAT: 'newChat',
    OPEN_SETTINGS: 'openSettings',
    OPEN_HISTORY: 'openHistory',
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
    /** Fired when a tool officially begins execution (after confirmation/auto-accept). Used to trigger the spinner. */
    TOOL_STARTED: 'toolStarted',
    TOOL_OUTPUT: 'agent:toolOutput',
    TOOL_END: 'agent:toolEnd',
    REQUEST_CONFIRMATION: 'agent:requestConfirmation',
    NOTIFICATION: 'notification',
    UPDATE_PROFILE_METADATA: 'updateProfileMetadata',
    SESSIONS_LIST: 'sessionsList',
    /** Fired when the agent reaches a logical limit (like max iterations) and needs user permission to continue. */
    HALTED: 'halted',
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

/**
 * Internal EventBus event names. Centralized to prevent string literal drift.
 */
export const APP_EVENTS = {
  CONFIG_CHANGED: 'configChanged',
  INLINE_COMPLETION_TOGGLED: 'inlineCompletionToggled',
  AUTO_ACCEPT_EDITS_TOGGLED: 'autoAcceptEditsToggled',
  CHAT_PROFILE_CHANGED: 'chatProfileChanged',
  COMPLETION_PROFILE_CHANGED: 'completionProfileChanged',
  AGENT_MAX_ITERATIONS: 'agent:maxIterationsReached',
  ANONYMIZATION: 'anonymization',
  AGENT_TOKEN: 'agent:token',
  AGENT_TOOL_START: 'agent:toolStart',
  AGENT_TOOL_EXECUTION_STARTED: 'agent:toolExecutionStarted',
  AGENT_TOOL_OUTPUT: 'agent:toolOutput',
  AGENT_TOOL_END: 'agent:toolEnd',
  AGENT_REQUEST_CONFIRMATION: 'agent:requestConfirmation',
  USER_CONFIRMATION_RESPONSE: 'user:confirmationResponse',
  AGENT_NOTIFICATION: 'agent:notification',
  LOG: 'log',
} as const;

export type AppEvent = typeof APP_EVENTS[keyof typeof APP_EVENTS];
