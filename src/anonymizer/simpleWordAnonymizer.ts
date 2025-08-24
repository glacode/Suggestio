import { Anonymizer } from "./anonymizer.js";

export class SimpleWordAnonymizer implements Anonymizer {
    private mapping: Map<string, string> = new Map();
    private placeholderPrefix = 'ANON_';
    private counter = 0;

    constructor(private wordsToAnonymize: string[]) {
    }

    anonymize(text: string): string {
        let result = text;
        
        for (const word of this.wordsToAnonymize) {
            // Create case-insensitive regex with word boundaries
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            if (regex.test(result)) {
                const placeholder = `${this.placeholderPrefix}${this.counter++}`;
                this.mapping.set(placeholder, word);
                result = result.replace(regex, placeholder);
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