import { Anonymizer } from "./anonymizer.js";

export class SimpleWordAnonymizer implements Anonymizer {
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
}