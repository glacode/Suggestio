import { IAnonymizer, IStreamingDeanonymizer } from "../types.js";

export class SimpleWordAnonymizer implements IAnonymizer {
    private mapping: Map<string, string> = new Map();
    private placeholderPrefix = 'ANON_';
    private counter = -1;

    constructor(private wordsToAnonymize: string[]) {
    }

    anonymize(text: string): string {
        let result = text;
        const alreadyMapped = new Set<string>();

        for (const word of this.wordsToAnonymize) {
            // Create case-insensitive regex with word boundaries
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            let match;

            // Use a while loop to find all matches and replace them individually
            while ((match = regex.exec(result)) !== null) {
                const matchedText = match[0]; // Get the actual matched text with original case
                if (!alreadyMapped.has(matchedText)) {
                    alreadyMapped.add(matchedText);
                    this.counter++;
                }
                const placeholder = `${this.placeholderPrefix}${this.counter}`;
                this.mapping.set(placeholder, matchedText); // Store the exact matched text

                // Replace only this specific occurrence
                result = result.substring(0, match.index) +
                    placeholder +
                    result.substring(match.index + matchedText.length);

                // Reset regex lastIndex to continue searching from the right position
                regex.lastIndex = match.index + placeholder.length;
            }
        }

        return result;
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