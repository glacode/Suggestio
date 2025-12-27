import { isLikePath } from '../../src/anonymizer/isLikePath.js';

describe('isLikePath', () => {

  test('rejects strings without separators', () => {
    expect(isLikePath('filename')).toBe(false);
    expect(isLikePath('SimpleWordAnonymizer')).toBe(false);
  });

  test('normalizes backslashes and detects Windows-style paths', () => {
    expect(isLikePath('src\\utils\\file.ts')).toBe(true);
    expect(isLikePath('\\')).toBe(true);
    expect(isLikePath('C:\\Users\\test\\file.txt')).toBe(true);
  });

  test('accepts common file extensions (early return)', () => {
    expect(isLikePath('src/index.ts')).toBe(true);
    expect(isLikePath('lib/app.js')).toBe(true);
    expect(isLikePath('a/b/c.JSON')).toBe(true); // case-insensitive
    expect(isLikePath('docs/readme.md')).toBe(true);
  });

  test('accepts empty paths after split', () => {
    expect(isLikePath('/')).toBe(true);
    expect(isLikePath('////')).toBe(true);
  });

  test('accepts identifier-like path segments', () => {
    expect(isLikePath('src/utils/helpers')).toBe(true);
    expect(isLikePath('a-b_c.d/e-f_g')).toBe(true);
    expect(isLikePath('folder/.config/file')).toBe(true);
    expect(isLikePath('src/A9fKJ23Lsd9/file')).toBe(true);
  });

  test('allows empty segments (leading, trailing, double slashes)', () => {
    expect(isLikePath('/src/utils')).toBe(true);
    expect(isLikePath('src/utils/')).toBe(true);
    expect(isLikePath('src//utils')).toBe(true);
  });

  test('rejects paths with invalid characters in segments', () => {
    expect(isLikePath('src/uti$ls/file')).toBe(false);
    expect(isLikePath('src/hel@pers')).toBe(false);
    expect(isLikePath('src/white space/file')).toBe(false);
  });

  test('rejects high-entropy or symbol-heavy segments', () => {
    expect(isLikePath('src/###/file')).toBe(false);
  });

});
