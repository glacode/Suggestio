import { isLikeIdentifier } from '../../src/anonymizer/isLikeIdentifier.js';

describe('isLikeIdentifier', () => {

    test('accepts simple lowercase identifier', () => {
        expect(isLikeIdentifier('variable')).toBe(true);
    });

    test('accepts snake_case identifier', () => {
        expect(isLikeIdentifier('snake_case_var')).toBe(true);
    });

    test('accepts camelCase identifier', () => {
        expect(isLikeIdentifier('simpleWordAnonymizer')).toBe(true);
    });

    test('accepts PascalCase identifier', () => {
        expect(isLikeIdentifier('SimpleWordAnonymizer')).toBe(true);
    });

    test('accepts snake_case identifier', () => {
        expect(isLikeIdentifier('simple_word_example')).toBe(true);
    });

    test('accepts SCREAMING_SNAKE_CASE identifier', () => {
        expect(isLikeIdentifier('MAX_BUFFER_SIZE')).toBe(true);
    });

    test('accepts leading underscore', () => {
        expect(isLikeIdentifier('_internalState')).toBe(true);
    });

    test('accepts identifier with trailing digit', () => {
        expect(isLikeIdentifier('variable2')).toBe(true);
    });

    test('rejects tokens containing path separators', () => {
        expect(isLikeIdentifier('src/utils/file')).toBe(false);
        expect(isLikeIdentifier('src\\utils\\file')).toBe(false);
    });

    test('rejects tokens containing dot', () => {
        expect(isLikeIdentifier('file.ts')).toBe(false);
        expect(isLikeIdentifier('config.json')).toBe(false);
    });

    test('rejects token not starting with letter or underscore', () => {
        expect(isLikeIdentifier('1variable')).toBe(false);
        expect(isLikeIdentifier('-variable')).toBe(false);
    });

    test('rejects token with illegal characters', () => {
        expect(isLikeIdentifier('var-name')).toBe(false);
        expect(isLikeIdentifier('var$name')).toBe(false);
        expect(isLikeIdentifier('var@name')).toBe(false);
    });

    test('rejects digit-heavy tokens (likely random)', () => {
        // 6 digits / 10 chars = 0.6
        expect(isLikeIdentifier('a123456789')).toBe(false);
    });

    test('rejects mixed random-looking token', () => {
        expect(isLikeIdentifier('A9fKJ23Lsd9')).toBe(true);
    });

    test('accepts long readable identifier even if uncommon', () => {
        expect(isLikeIdentifier('calculateTotalAccumulatedBalance')).toBe(true);
    });

    test('rejects file paths even if identifier-like', () => {
        expect(isLikeIdentifier('src/anonymizer/simpleWordAnonymizer.ts')).toBe(false);
    });
});
