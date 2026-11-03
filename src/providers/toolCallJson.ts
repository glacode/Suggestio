/**
 * Validates a raw tool call arguments string against the contract providers
 * enforce server-side: the value must parse as a JSON object. Models
 * occasionally emit truncated or improperly quoted arguments; such strings
 * are repaired to '{}' before they reach the chat history, since a malformed
 * entry would make every follow-up request fail provider validation.
 */
export const isValidJsonObjectString = (value: string): boolean => {
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null;
    } catch {
        return false;
    }
};
