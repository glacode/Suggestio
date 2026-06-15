export const CONFIG_DEFAULTS = {
    LOG_LEVEL: 'Info',
    MAX_AGENT_ITERATIONS: 30,
    /** Default maximum length for tool results in characters. */
    TOOL_RESULT_MAX_LENGTH: 10000,
    /** Default maximum number of retries for API calls. */
    MAX_RETRIES: 5,
    /** Default initial delay for exponential backoff in ms. */
    INITIAL_DELAY: 1000,
    /** Default session-only auto-accept edits setting. */
    AUTO_ACCEPT_EDITS: false,
    /** Default maximum number of chat sessions to keep. */
    MAX_SAVED_CHAT_SESSIONS: 3,
    /** Default maximum length for chat session titles. */
    SESSION_TITLE_MAX_LENGTH: 100,
    /** Default Shannon entropy threshold for anonymization. */
    ANONYMIZER_ALLOWED_ENTROPY: 0.85,
    /** Default minimum length for entropy-based anonymization. */
    ANONYMIZER_MIN_LENGTH: 10,
    /** Default inline completion enabled status. */
    INLINE_COMPLETION_ENABLED: true,
    /** Default supported languages for inline completion. */
    INLINE_COMPLETION_SUPPORTED_LANGUAGES: [],
    /** Default status for inline completion in untitled editors. */
    INLINE_COMPLETION_ENABLE_IN_UNTITLED_EDITORS: false,
    /** Maximum tokens to request from a FIM completion endpoint (inline completions are short). */
    FIM_MAX_TOKENS: 256,
    /** Number of lines after the cursor to send as the FIM `suffix` (more context than the chat path). */
    FIM_SUFFIX_MAX_LINES: 60,
} as const;
