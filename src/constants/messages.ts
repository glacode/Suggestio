export const AGENT_MESSAGES = {
    ERROR_NO_WORKSPACE: 'Error: No workspace open.',
    ERROR_TOOL_NOT_FOUND: (name: string) => `Error: Tool ${name} not found.`,
    ERROR_TOOL_FAILED: 'Error: Tool failed',
    REQUERYING_LLM: 'Re-querying LLM with tool results...',
} as const;

export const CHAT_MESSAGES = {
    MAX_ITERATIONS_REACHED: (max: number) => `⚠️ **Max iterations reached (${max}).** The agent stopped to prevent infinite loops. Please refine your prompt or increase the limit in settings.`,
    ERROR_PROCESSING_REQUEST: (error: any) => `Sorry, there was an error processing your request: ${error}`,
} as const;

export const AGENT_LOGS = {
    ITERATION_START: (iteration: number, max: number) => `Agent iteration ${iteration}/${max} starting...`,
    RESPONSE_RECEIVED: 'LLM response received.',
    TEXT_RESPONSE_RECEIVED: (length: number) => `LLM returned a text response (${length} chars).`,
    TOOL_CALLS_RECEIVED: (count: number) => `LLM returned ${count} tool calls.`,
    NO_RESPONSE_RECEIVED: 'LLM returned no response.',
    AGENT_FINISHED: 'Agent finished execution.',
    MAX_ITERATIONS_REACHED: (max: number) => `Agent reached max iterations (${max}).`,
    ASSISTANT_TOOL_CALLS: (count: number) => `Assistant requested ${count} tool calls.`,
    EXECUTING_TOOL: (name: string) => `Executing tool: ${name}`,
    TOOL_NOT_FOUND: (name: string) => `Tool not found: ${name}`,
    TOOL_ERROR: (error: string) => `Error executing tool: ${error}`,
    TOOL_RESULT_RECORDED: (id: string) => `Recorded result for tool call ${id}.`,
    REQUERYING_LLM: 'Re-querying LLM with tool results...',
    CANCEL_REQUEST: 'Cancelling LLM request...',
    REQUEST_CANCELLED: 'Request was cancelled by user.',
} as const;

export const EXTENSION_MESSAGES = {
    ACTIVATED: 'Suggestio Activated!',
} as const;

export const EXTENSION_LOGS = {
    ACTIVATE: 'Suggestio: Activate',
    ANONYMIZED: (original: string, placeholder: string, type: string) => `[Anonymizer] Anonymized '${original}' to '${placeholder}' (Reason: ${type})`,
    DIRECTORY_READ_ERROR: (path: string, error: any) => `Error reading directory ${path}: ${error}`,
} as const;

export const CONFIG_MESSAGES = {
    FILE_NOT_FOUND: (path: string) => `File not found or unreadable: ${path}`,
    LOAD_FAILED: (error: any) => `Failed to load config.json: ${error}`,
    ENTER_NEW_API_KEY: (placeholder: string) => `Enter new API key for ${placeholder}`,
    API_KEY_PLACEHOLDER: (placeholder: string) => `Your ${placeholder} API key here...`,
    API_KEY_UPDATED: (placeholder: string) => `API key for ${placeholder} updated.`,
    API_KEY_REQUIRED: (placeholder: string) => `API key for ${placeholder} is required for this feature to work.`,
    ENTER_API_KEY: (placeholder: string) => `Enter your ${placeholder} API Key`,
    SELECT_API_KEY_TO_UPDATE: 'Select an API key to update',
    SELECT_API_KEY_TO_DELETE: 'Select an API key to delete',
    API_KEY_DELETED: (placeholder: string) => `API key value for ${placeholder} deleted.`,
} as const;

export const LLM_MESSAGES = {
    GEMINI_ERROR: (status: number, text: string) => `Gemini API error: ${status} - ${text}`,
    OPENAI_ERROR: (status: number, text: string) => `OpenAI API error: ${status} - ${text}`,
    OPENAI_GENERIC_ERROR: (msg: string) => `OpenAI API error: ${msg}`,
    RESPONSE_BODY_NULL: 'Response body is null',
    PARSE_JSON_FAILED: (status: number, text: string) => `Failed to parse response as JSON: ${status} ${text}`,
    MALFORMED_RESPONSE: (msg: string) => `Malformed OpenAI API response: ${msg}`,
    MISSING_CHOICES: "Unexpected OpenAI API response: Missing 'choices' field.",
    PARSE_CHUNK_ERROR: (chunk: string) => `Error parsing chunk: ${chunk}`,
} as const;

export const LLM_LOGS = {
    RECEIVING_STREAM: 'Receiving streaming response...',
    STREAM_CHUNK_RECEIVED: (size: number) => `Received chunk of size ${size}.`,
    STREAM_DATA_RECEIVED: (data: string) => `Stream data: ${data}`,
    STREAM_FINISHED: 'Stream finished.',
    STREAM_DONE: '[DONE] received.',
    STREAM_FINISH_REASON: (reason: string) => `Stream finish reason: ${reason}`,
} as const;
