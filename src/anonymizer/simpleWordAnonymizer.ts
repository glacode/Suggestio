import { IAnonymizer, IStreamingDeanonymizer } from "../types.js";

export class SimpleWordAnonymizer implements IAnonymizer {
    private mapping: Map<string, string> = new Map();
    private reverseMapping: Map<string, string> = new Map();
    private placeholderPrefix = 'ANON_';
    private counter = -1;

    constructor(
        private wordsToAnonymize: string[],
        private allowedEntropy?: number,
        private minAnonymizationLength?: number
    ) {
    }

    /**
     * Calculates the Shannon entropy of a string.
     * Entropy is a measure of randomness or unpredictability.
     * Higher entropy values (typically > 3.0-4.0 for short strings) often indicate
     * random keys, passwords, or encrypted data rather than natural language.
     */
    private getEntropy(str: string): number {
        const len = str.length;
        if (len === 0) {
            return 0;
        }
        const frequencies = new Map<string, number>();
        for (const char of str) {
            frequencies.set(char, (frequencies.get(char) || 0) + 1);
        }

        let entropy = 0;
        for (const count of frequencies.values()) {
            const p = count / len;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    private anonymizeEntropy(text: string): string {
        if (this.allowedEntropy === undefined || this.minAnonymizationLength === undefined) {
            return text;
        }

        let result = text;
        const minLen = this.minAnonymizationLength;
        const regex = /[a-zA-Z0-9_\-\+/=]+/g;
        let match;
        const candidates: { start: number; end: number; text: string }[] = [];

        while ((match = regex.exec(result)) !== null) {
            const token = match[0];
            if (token.length >= minLen) {
                // Skip existing placeholders
                if (token.startsWith(this.placeholderPrefix) && /^\d+$/.test(token.slice(this.placeholderPrefix.length))) {
                    continue;
                }

                // Rule: identifiers consisting only of letters and underscores are usually safe.
                // We also allow a single digit at the end (e.g. "variable2").
                // This prevents anonymizing long class names like "SimpleWordAnonymizer" or private variables like "_internalState".
                if (/^[a-zA-Z_]+\d?$/.test(token)) {
                    continue;
                }

                if (this.getEntropy(token) > this.allowedEntropy) {
                    candidates.push({
                        start: match.index,
                        end: match.index + token.length,
                        text: token
                    });
                }
            }
        }

        // Replace from back to front to avoid index shifting issues
        for (let i = candidates.length - 1; i >= 0; i--) {
            const { start, end, text: token } = candidates[i];
            
            let placeholder = this.reverseMapping.get(token);
            if (!placeholder) {
                this.counter++;
                placeholder = `${this.placeholderPrefix}${this.counter}`;
                this.mapping.set(placeholder, token);
                this.reverseMapping.set(token, placeholder);
            }
            
            result = result.substring(0, start) + placeholder + result.substring(end);
        }

        return result;
    }

    anonymize(text: string): string {
        let result = text;

        for (const word of this.wordsToAnonymize) {
            // Create case-insensitive regex with word boundaries
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            let match;

            // Use a while loop to find all matches and replace them individually
            while ((match = regex.exec(result)) !== null) {
                const matchedText = match[0]; // Get the actual matched text with original case
                let placeholder = this.reverseMapping.get(matchedText);
                
                if (!placeholder) {
                    this.counter++;
                    placeholder = `${this.placeholderPrefix}${this.counter}`;
                    this.mapping.set(placeholder, matchedText); // Store the exact matched text
                    this.reverseMapping.set(matchedText, placeholder);
                }

                // Replace only this specific occurrence
                result = result.substring(0, match.index) +
                    placeholder +
                    result.substring(match.index + matchedText.length);

                // Reset regex lastIndex to continue searching from the right position
                regex.lastIndex = match.index + placeholder.length;
            }
        }

        return this.anonymizeEntropy(result);
    }

    deanonymize(text: string): string {
        let result = text;

        for (const [placeholder, original] of this.mapping) {
            result = result.replace(new RegExp(placeholder, 'g'), original);
        }

        return result;
    }

    createStreamingDeanonymizer(): IStreamingDeanonymizer {
        return new SimpleStreamingDeanonymizer(this.mapping, this.placeholderPrefix);
    }
}

class SimpleStreamingDeanonymizer implements IStreamingDeanonymizer {
    private buffer = '';

    constructor(private mapping: Map<string, string>, private prefix: string) { }

    process(chunk: string): { processed: string; buffer: string } {
        this.buffer += chunk;
        let processed = '';
        
        while (this.buffer.length > 0) {
             // Find potential placeholder start
            const prefixIndex = this.buffer.indexOf(this.prefix[0]); // Look for 'A' (of ANON_)

            if (prefixIndex === -1) {
                // No 'A' found, flush everything
                processed += this.buffer;
                this.buffer = '';
                break;
            }

            // Flush everything before the 'A'
            if (prefixIndex > 0) {
                processed += this.buffer.substring(0, prefixIndex);
                this.buffer = this.buffer.substring(prefixIndex);
            }

            // Now buffer starts with 'A'. Check if it could be our prefix
            // We need to see if the buffer *starts* with a partial match of prefix
            // or a full match of prefix + number
            
            // Check for match against known placeholders
            // Optimally, we should match against regex or checking known keys. 
            // Since placeholders are ANON_\d+, we can try to match that pattern.
            
            // Regex for ANON_\d+
            const match = this.buffer.match(new RegExp(`^${this.prefix}\\d+`));
            
            if (match) {
                const placeholder = match[0];
                if (this.mapping.has(placeholder)) {
                    processed += this.mapping.get(placeholder);
                    this.buffer = this.buffer.substring(placeholder.length);
                    continue; // Continue processing the rest of the buffer
                } else {
                     // It looks like a placeholder but we don't have it in mapping? 
                     // Or maybe it's ANON_999 but we only have ANON_0.
                     // Treat as normal text if it's a full match but not mapped (edge case)
                     // or wait if it's partial?
                     // If it matches the regex, it is a full token.
                     // If we don't have it, just flush it.
                     processed += placeholder;
                     this.buffer = this.buffer.substring(placeholder.length);
                     continue;
                }
            }

            // If no full match, check if it COULD be a match (partial prefix)
            // e.g. "AN", "ANON", "ANON_"
            if (this.isPartialMatch(this.buffer)) {
                 // It might become a placeholder, keep in buffer
                 break; 
            } else {
                // It started with 'A' but isn't our prefix (e.g. "Apple")
                // Flush the first char 'A' and continue loop to search for next 'A'
                processed += this.buffer[0];
                this.buffer = this.buffer.substring(1);
            }
        }

        return { processed, buffer: this.buffer };
    }

    flush(): string {
        const remaining = this.buffer;
        this.buffer = '';
        return remaining;
    }

    private isPartialMatch(text: string): boolean {
        // Check if text is a prefix of any valid placeholder pattern "ANON_\d+"
        // simpler: check if text is prefix of "ANON_" OR "ANON_" is prefix of text (but text is shorter than full placeholder)
        
        // Case 1: text is shorter than prefix "ANON_"
        if (text.length < this.prefix.length) {
            return this.prefix.startsWith(text);
        }

        // Case 2: text starts with "ANON_"
        if (text.startsWith(this.prefix)) {
            // Check if the rest are digits
            const rest = text.substring(this.prefix.length);
            return /^\d*$/.test(rest);
        }

        return false;
    }
}