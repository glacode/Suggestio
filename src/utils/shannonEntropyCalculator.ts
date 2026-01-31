import { IEntropyCalculator } from "../types.js";

/**
 * Implementation of Shannon entropy calculation.
 */
export class ShannonEntropyCalculator implements IEntropyCalculator {
    /**
     * Calculates the normalized Shannon entropy of a string.
     * Entropy is a measure of randomness or unpredictability.
     * Normalized entropy (H / log2(length)) ranges from 0 to 1.
     * Higher values (typically > 0.8-0.9) often indicate
     * random keys, passwords, or encrypted data rather than natural language.
     * @param str The string to calculate entropy for.
     * @returns The normalized entropy value between 0 and 1.
     */
    getEntropy(str: string): number {
        const len = str.length;
        if (len <= 1) {
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
        // Normalize by log2(length) to get a value between 0 and 1
        return entropy / Math.log2(len);
    }
}
