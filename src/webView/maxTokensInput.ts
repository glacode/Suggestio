/**
 * The outcome of parsing the optional "Max Tokens (max_tokens)" input field.
 */
export type MaxTokensParse =
    | { kind: 'unset' }
    | { kind: 'value'; value: number }
    | { kind: 'invalid' };

const maxTokensDigitPattern = /^[1-9]\d*$/;

/**
 * Parses the raw text of the maxTokens input field.
 *
 * `unset` means blank input: the field is intentionally left out of the
 * profile and the provider default applies. `value` carries a positive
 * integer to send as the profile's maxTokens. `invalid` marks non-numeric
 * or non-positive input, which must block saving.
 */
export function parseMaxTokensInput(raw: string): MaxTokensParse {
    const trimmed = raw.trim();
    if (trimmed.length === 0) { return { kind: 'unset' }; }
    if (!maxTokensDigitPattern.test(trimmed)) { return { kind: 'invalid' }; }
    return { kind: 'value', value: Number(trimmed) };
}

/**
 * Reads the maxTokens input and, when the field carries a positive integer,
 * stores it on the profile payload.
 */
export function addMaxTokensToPayload(profilePayload: { maxTokens?: number }, raw: string): void {
    const parsedMaxTokens = parseMaxTokensInput(raw);
    if (parsedMaxTokens.kind === 'value') { profilePayload.maxTokens = parsedMaxTokens.value; }
}
