/**
 * Validates a raw tool call arguments string against the contract providers
 * enforce server-side: the value must parse as the JSON of an object. Models
 * occasionally emit truncated or improperly quoted arguments; such strings
 * are repaired before they reach the chat history, since a malformed entry
 * would make every follow-up request fail provider validation.
 */

/**
 * The self-describing stub that replaces a damaged arguments string. The
 * tool call it appears in carries the parse error and the original text as
 * annotations, so the agent's tool result can tell the model what it
 * actually sent.
 */
export const DAMAGED_ARGUMENTS_STUB =
    '{"_argumentsWereDamaged": "The original arguments text was unparseable JSON and has been replaced by this stub. See the following tool result for the original text and required parameters."}';

/**
 * Returns the underlying JSON.parse error when the given string is not the
 * verbatim JSON of an object, or null when it is. Repair seams use null to
 * mean "intact": anything else is damaged and must be replaced.
 */
export const getJsonParseFailure = (value: string): string | null => {
    try {
        const parsed = JSON.parse(value);
        // Providers require a JSON *object*: arrays and null pass JSON.parse
        // but are refused by the same validation as malformed strings.
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return null;
        }
        return 'JSON value is not an object';
    } catch (e) {
        return e instanceof Error && e.message ? e.message : String(e);
    }
};
