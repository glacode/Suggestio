import { describe, it, expect } from '@jest/globals';
import { parseMaxTokensInput } from '../../src/webView/maxTokensInput.js';

describe('parseMaxTokensInput', () => {
    it('treats blank input as unset', () => {
        expect(parseMaxTokensInput('')).toEqual({ kind: 'unset' });
    });

    it('treats whitespace-only input as unset', () => {
        expect(parseMaxTokensInput('   ')).toEqual({ kind: 'unset' });
    });

    it('parses a positive integer and trims surrounding whitespace', () => {
        expect(parseMaxTokensInput('1024')).toEqual({ kind: 'value', value: 1024 });
        expect(parseMaxTokensInput(' 1024 ')).toEqual({ kind: 'value', value: 1024 });
    });

    it('flags non-numeric input as invalid', () => {
        expect(parseMaxTokensInput('abc')).toEqual({ kind: 'invalid' });
        expect(parseMaxTokensInput('12a')).toEqual({ kind: 'invalid' });
    });

    it('flags non-positive numbers as invalid', () => {
        expect(parseMaxTokensInput('0')).toEqual({ kind: 'invalid' });
        expect(parseMaxTokensInput('-5')).toEqual({ kind: 'invalid' });
    });
});
