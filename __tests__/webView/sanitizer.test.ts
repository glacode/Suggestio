/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { createSanitizer } from '../../src/webView/sanitizer.js';

describe('Sanitizer', () => {
    describe('DomPurifySanitizer (default)', () => {
        const sanitizer = createSanitizer(false);

        it('should strip script tags', () => {
            const input = '<div>Hello<script>alert("xss")</script></div>';
            const output = sanitizer.sanitize(input);
            expect(output).toBe('<div>Hello</div>');
        });

        it('should strip event handlers', () => {
            const input = '<img src="x" onerror="alert(1)">';
            const output = sanitizer.sanitize(input);
            expect(output).toBe('<img src="x">');
        });

        it('should preserve safe HTML', () => {
            const input = '<b>Bold</b><i>Italic</i>';
            const output = sanitizer.sanitize(input);
            expect(output).toBe('<b>Bold</b><i>Italic</i>');
        });
    });

    describe('NullSanitizer (disabled)', () => {
        const sanitizer = createSanitizer(true);

        it('should NOT strip script tags', () => {
            const input = '<div>Hello<script>alert("xss")</script></div>';
            const output = sanitizer.sanitize(input);
            expect(output).toBe(input);
        });

        it('should NOT strip event handlers', () => {
            const input = '<img src="x" onerror="alert(1)">';
            const output = sanitizer.sanitize(input);
            expect(output).toBe(input);
        });
    });
});
