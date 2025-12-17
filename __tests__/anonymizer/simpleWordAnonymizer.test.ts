import { SimpleWordAnonymizer } from '../../src/anonymizer/simpleWordAnonymizer.js';

describe('SimpleWordAnonymizer', () => {
  test('anonymizes and deanonymizes single word', () => {
    const anonymizer = new SimpleWordAnonymizer(['secret']);
    const input = 'This is a secret message';
    
    const anonymized = anonymizer.anonymize(input);
    expect(anonymized).toMatch(/ANON_0/); // replaced word
    expect(anonymized).not.toContain('secret'); // word should be gone

    const deanonymized = anonymizer.deanonymize(anonymized);
    expect(deanonymized).toBe(input);
  });

  test('anonymizes multiple different words', () => {
    const anonymizer = new SimpleWordAnonymizer(['apple', 'banana']);
    const input = 'I like apple and banana';

    const anonymized = anonymizer.anonymize(input);
    expect(anonymized).toContain('ANON_0');
    expect(anonymized).toContain('ANON_1');
    expect(anonymized).not.toContain('apple');
    expect(anonymized).not.toContain('banana');

    const deanonymized = anonymizer.deanonymize(anonymized);
    expect(deanonymized).toBe(input);
  });

  test('handles case-insensitive matches', () => {
    const anonymizer = new SimpleWordAnonymizer(['secret']);
    const input = 'Secret and SECRET and secret';
    
    const anonymized = anonymizer.anonymize(input);
    expect(anonymized).toMatch(/ANON_0/);
    expect(anonymized).not.toMatch(/secret/i);

    const deanonymized = anonymizer.deanonymize(anonymized);
    expect(deanonymized).toBe(input);
  });

  test('does not anonymize partial words', () => {
    const anonymizer = new SimpleWordAnonymizer(['cat']);
    const input = 'concatenate catalog cat';
    
    const anonymized = anonymizer.anonymize(input);
    // only last "cat" should be replaced
    expect(anonymized).toMatch(/concatenate catalog ANON_0/);

    const deanonymized = anonymizer.deanonymize(anonymized);
    expect(deanonymized).toBe(input);
  });

  test('assigns new placeholders sequentially', () => {
    const anonymizer = new SimpleWordAnonymizer(['one', 'two']);
    anonymizer.anonymize('one two');
    anonymizer.anonymize('one two');

    // Should have placeholders ANON_0, ANON_1, ANON_2, ANON_3
    const keys = Array.from((anonymizer as any).mapping.keys());
    expect(keys).toEqual(['ANON_0', 'ANON_1', 'ANON_2', 'ANON_3']);
  });

  test('anonymizes word that appears multiple times with same placeholder', () => {
    const anonymizer = new SimpleWordAnonymizer(['secret']);
    const input = 'This is a secret message with another secret word';
    
    const anonymized = anonymizer.anonymize(input);
    // Both occurrences should be replaced with the same placeholder
    expect(anonymized).toBe('This is a ANON_0 message with another ANON_0 word');
    expect(anonymized).not.toContain('secret');
    
    const deanonymized = anonymizer.deanonymize(anonymized);
    expect(deanonymized).toBe(input);
  });

  describe('Streaming Deanonymization', () => {
    let anonymizer: SimpleWordAnonymizer;

    beforeEach(() => {
        anonymizer = new SimpleWordAnonymizer(['secret']);
    });

    test('handles a single chunk containing a full placeholder surrounded by text', () => {
        // 1. Establish mapping: "secret" -> "ANON_0"
        anonymizer.anonymize('secret');
        
        const streamer = anonymizer.createStreamingDeanonymizer();
        
        // 2. Process chunk "previous ANON_0 next"
        const chunk = 'previous ANON_0 next';
        const { processed, buffer } = streamer.process(chunk);
        
        expect(processed).toBe('previous secret next');
        expect(buffer).toBe('');
    });

    test('handles split tokens across chunks', () => {
        anonymizer.anonymize('secret'); // ANON_0
        const streamer = anonymizer.createStreamingDeanonymizer();

        // Chunk 1: "This is A" (Start of prefix)
        let result = streamer.process('This is A');
        expect(result.processed).toBe('This is ');
        expect(result.buffer).toBe('A');

        // Chunk 2: "NON_" (Rest of prefix)
        result = streamer.process('NON_');
        expect(result.processed).toBe('');
        expect(result.buffer).toBe('ANON_');

        // Chunk 3: "0." (Number and trailing char)
        result = streamer.process('0.');
        expect(result.processed).toBe('secret.');
        expect(result.buffer).toBe('');
    });
  });
});
