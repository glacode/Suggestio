import { IAnonymizer, IStreamingDeanonymizer, IAnonymizationNotifier, IEntropyCalculator } from "../types.js";
import { isLikeIdentifier } from "./isLikeIdentifier.js";
import { isLikePath } from "./isLikePath.js";
import { matchesWellKnownSecret } from "./matchesWellKnownSecret.js";

/**
 * Arguments for the SimpleWordAnonymizer constructor.
 */
export interface ISimpleWordAnonymizerArgs {
    /** List of words that should be explicitly anonymized. */
    wordsToAnonymize: string[];
    /** Calculator for entropy-based anonymization. */
    entropyCalculator: IEntropyCalculator;
    /** Optional threshold for entropy-based anonymization. Strings with entropy higher than this will be anonymized. */
    allowedEntropy?: number;
    /** Optional minimum length for entropy-based anonymization. */
    minLength?: number;
    /** Optional notifier to receive events when anonymization occurs. */
    notifier?: IAnonymizationNotifier;
}

export class SimpleWordAnonymizer implements IAnonymizer {
    private mapping: Map<string, string> = new Map();
    private reverseMapping: Map<string, string> = new Map();
    private placeholderPrefix = 'ANON_';
    private counter = -1;
    private wordsToAnonymize: string[];
    private entropyCalculator: IEntropyCalculator;
    private allowedEntropy?: number;
    private minLength?: number;
    private notifier?: IAnonymizationNotifier;

    /**
     * Creates an instance of SimpleWordAnonymizer.
     * @param args - The configuration arguments for the anonymizer.
     */
    constructor({
        wordsToAnonymize,
        entropyCalculator,
        allowedEntropy,
        minLength,
        notifier
    }: ISimpleWordAnonymizerArgs) {
        this.wordsToAnonymize = wordsToAnonymize;
        this.entropyCalculator = entropyCalculator;
        this.allowedEntropy = allowedEntropy;
        this.minLength = minLength;
        this.notifier = notifier;
    }

    private anonymizeEntropy(text: string): string {
        if (this.allowedEntropy === undefined || this.minLength === undefined) {
            return text;
        }

        const minLen = this.minLength;
        const regex = /[a-zA-Z0-9_\-\+/=#@$\*£\?\^]+/g;
        let match;
        const candidates: { start: number; end: number; text: string }[] = [];

        while ((match = regex.exec(text)) !== null) {
            const token = match[0];
            if (token.length >= minLen) {
                // 1.Skip existing placeholders
                if (token.startsWith(this.placeholderPrefix) && /^\d+$/.test(token.slice(this.placeholderPrefix.length))) {
                    continue;
                }

                // 2. High-confidence secrets → anonymize immediately
                if (matchesWellKnownSecret(token)) {
                    candidates.push({ start: match.index, end: match.index + token.length, text: token });
                    continue;
                }

                // 3. Structural negatives → skip
                if (isLikePath(token) || isLikeIdentifier(token)) {
                    continue;
                }

                // 4. Entropy check
                if (this.entropyCalculator.getEntropy(token) > this.allowedEntropy) {
                    candidates.push({
                        start: match.index,
                        end: match.index + token.length,
                        text: token
                    });
                }
            }
        }

        if (candidates.length === 0) {
            return text;
        }

        let result = '';
        let lastIndex = 0;

        for (const candidate of candidates) {
            const { start, end, text: token } = candidate;

            let placeholder = this.reverseMapping.get(token);
            if (!placeholder) {
                this.counter++;
                placeholder = `${this.placeholderPrefix}${this.counter}`;
                this.mapping.set(placeholder, token);
                this.reverseMapping.set(token, placeholder);
            }
            this.notifier?.notifyAnonymization(token, placeholder, 'entropy');

            result += text.substring(lastIndex, start);
            result += placeholder;
            lastIndex = end;
        }
        result += text.substring(lastIndex);

        return result;
    }

    private processWordAnonymization(text: string): string {
        let result = text;
        for (const word of this.wordsToAnonymize) {
            result = this.anonymizeSingleWord(result, word);
        }
        return result;
    }

    private anonymizeSingleWord(text: string, word: string): string {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        let match;
        const matches: RegExpExecArray[] = [];
        
        while ((match = regex.exec(text)) !== null) {
            matches.push(match);
        }

        if (matches.length === 0) {
            return text;
        }

        let result = '';
        let lastIndex = 0;

        for (const match of matches) {
            const original = match[0];
            const placeholder = this.resolvePlaceholder(original);
            this.notifyWordAnonymization(original, placeholder);

            result += text.substring(lastIndex, match.index);
            result += placeholder;
            lastIndex = match.index + original.length;
        }
        result += text.substring(lastIndex);

        return result;
    }

    private resolvePlaceholder(original: string): string {
        if (this.reverseMapping.has(original)) {
            return this.reverseMapping.get(original)!;
        }
        return this.generateNewPlaceholder(original);
    }

    private generateNewPlaceholder(original: string): string {
        this.counter++;
        const placeholder = `${this.placeholderPrefix}${this.counter}`;
        this.mapping.set(placeholder, original);
        this.reverseMapping.set(original, placeholder);
        return placeholder;
    }

    private notifyWordAnonymization(original: string, placeholder: string): void {
        this.notifier?.notifyAnonymization(original, placeholder, 'word');
    }

    /**
     * Anonymizes the given text by replacing sensitive words and high-entropy strings with placeholders.
     * @param text The input text to anonymize.
     * @returns The anonymized text with placeholders.
     */
    anonymize(text: string): string {
        const textWithWords = this.processWordAnonymization(text);
        return this.anonymizeEntropy(textWithWords);
    }

    /**
     * Replaces placeholders in the given text with their original values.
     * @param text The text containing placeholders.
     * @returns The text with placeholders replaced by original values.
     */
    deanonymize(text: string): string {
        return text.replace(/ANON_\d+/g, (match) => {
            return this.mapping.get(match) || match;
        });
    }

    /**
     * Creates a streaming deanonymizer instance.
     * @returns An object capable of deanonymizing a stream of text chunks.
     */
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