
import { extractPrefix } from '../../src/promptBuilder/extractPrefix.js';

// Helper to create a mock TextDocument
const createMockDocument = (lines: string[]) => ({
  lineAt: (index: number) => ({
    text: lines[index] || '',
  }),
  lineCount: lines.length,
});

// Helper to create a mock Position
const createMockPosition = (line: number, character: number) => ({
  line,
  character,
});

describe('extractPrefix', () => {
  it('should extract prefix from the middle of the document', () => {
    const doc = createMockDocument([
      'line 1',
      'line 2',
      'line 3 with some text',
      'line 4',
    ]);
    const pos = createMockPosition(2, 8);
    const prefix = extractPrefix(doc as any, pos as any);
    expect(prefix).toBe('line 1\nline 2\nline 3 w');
  });

  it('should extract prefix from the beginning of a line', () => {
    const doc = createMockDocument(['first line', 'second line']);
    const pos = createMockPosition(1, 0);
    const prefix = extractPrefix(doc as any, pos as any);
    expect(prefix).toBe('first line\n');
  });

  it('should handle position at the very beginning of the document', () => {
    const doc = createMockDocument(['hello', 'world']);
    const pos = createMockPosition(0, 0);
    const prefix = extractPrefix(doc as any, pos as any);
    expect(prefix).toBe('');
  });

  it('should extract the full content up to the position', () => {
    const doc = createMockDocument(['one', 'two', 'three']);
    const pos = createMockPosition(2, 5);
    const prefix = extractPrefix(doc as any, pos as any);
    expect(prefix).toBe('one\ntwo\nthree');
  });

  it('should respect the maxLines parameter', () => {
    const doc = createMockDocument([
      'line 0',
      'line 1',
      'line 2',
      'line 3',
      'line 4',
    ]);
    const pos = createMockPosition(4, 2);
    const prefix = extractPrefix(doc as any, pos as any, 3);
    // Should only include lines 2, 3, and 4 (up to position)
    expect(prefix).toBe('line 2\nline 3\nli');
  });

  it('should handle an empty document', () => {
    const doc = createMockDocument([]);
    const pos = createMockPosition(0, 0);
    const prefix = extractPrefix(doc as any, pos as any);
    expect(prefix).toBe('');
  });

  it('should handle an empty line', () => {
    const doc = createMockDocument(['line 1', '', 'line 3']);
    const pos = createMockPosition(2, 4);
    const prefix = extractPrefix(doc as any, pos as any);
    expect(prefix).toBe('line 1\n\nline');
  });
});
