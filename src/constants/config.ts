export const CONFIG_DEFAULTS = {
    LOG_LEVEL: 'Info',
    MAX_AGENT_ITERATIONS: 30,
    /** Default maximum length for tool results in characters. */
    TOOL_RESULT_MAX_LENGTH: 10000,
    /** Default maximum number of retries for API calls. */
    MAX_RETRIES: 5,
    /** Default initial delay for exponential backoff in ms. */
    INITIAL_DELAY: 1000,
} as const;
