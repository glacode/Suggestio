/**
 * Utility to tokenize shell commands into their constituent parts, respecting quotes and escapes.
 */
export class ShellTokenizer {
    /**
     * Tokenizes a shell command.
     * @param command The shell command to tokenize.
     * @returns An array of tokens.
     */
    static tokenize(command: string): string[] {
        const tokens: string[] = [];
        let currentToken = '';
        let inQuotes = false;
        let quoteChar: string | null = null;
        let escaped = false;

        for (let i = 0; i < command.length; i++) {
            const char = command[i];

            if (escaped) {
                currentToken += char;
                escaped = false;
                continue;
            }

            if (char === '\\' && (!inQuotes || quoteChar === '"')) {
                escaped = true;
                continue;
            }

            if (inQuotes) {
                if (char === quoteChar) {
                    inQuotes = false;
                    quoteChar = null;
                } else {
                    currentToken += char;
                }
                continue;
            }

            if (char === "'" || char === '"') {
                inQuotes = true;
                quoteChar = char;
                continue;
            }

            if (/\s/.test(char)) {
                if (currentToken) {
                    tokens.push(currentToken);
                    currentToken = '';
                }
                continue;
            }

            // Check for multi-char operators
            const nextChar = command[i + 1];
            if ((char === '&' && nextChar === '&') || (char === '|' && nextChar === '|')) {
                if (currentToken) {
                    tokens.push(currentToken);
                }
                tokens.push(char + nextChar);
                currentToken = '';
                i++;
                continue;
            }

            // Check for single-char operators
            if ([';', '|', '>', '<'].includes(char)) {
                if (currentToken) {
                    tokens.push(currentToken);
                }
                tokens.push(char);
                currentToken = '';
                continue;
            }

            currentToken += char;
        }

        if (currentToken) {
            tokens.push(currentToken);
        }

        return tokens;
    }
}
