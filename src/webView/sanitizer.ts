import DOMPurify from 'dompurify';
import type { ISanitizer } from '../types.js';

/**
 * A sanitizer implementation that uses DOMPurify to strip dangerous HTML.
 */
class DomPurifySanitizer implements ISanitizer {
    public sanitize(html: string): string {
        return DOMPurify.sanitize(html);
    }
}

/**
 * A "null" sanitizer that returns the HTML unchanged.
 * Used for debugging purposes when sanitization is explicitly disabled.
 */
class NullSanitizer implements ISanitizer {
    public sanitize(html: string): string {
        return html;
    }
}

/**
 * Factory function to create a sanitizer instance based on the configuration.
 * 
 * @param disableSanitizer Whether sanitization should be disabled.
 * @returns An implementation of ISanitizer.
 */
export function createSanitizer(disableSanitizer: boolean): ISanitizer {
    if (disableSanitizer) {
        return new NullSanitizer();
    }
    return new DomPurifySanitizer();
}
