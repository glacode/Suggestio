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
    /** Default Shannon entropy threshold for anonymization. */
    ANONYMIZER_ALLOWED_ENTROPY: 0.85,
    /** Default minimum length for entropy-based anonymization. */
    ANONYMIZER_MIN_LENGTH: 10,
    /** Default inline completion enabled status. */
    INLINE_COMPLETION_ENABLED: true,
} as const;
