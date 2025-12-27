import { SimpleWordAnonymizer } from '../../src/anonymizer/simpleWordAnonymizer.js';
import { IAnonymizationNotifier } from '../../src/types.js';

class MockNotifier implements IAnonymizationNotifier {
    public notifications: { original: string; placeholder: string; type: 'word' | 'entropy' }[] = [];

    notifyAnonymization(original: string, placeholder: string, type: 'word' | 'entropy'): void {
        this.notifications.push({ original, placeholder, type });
    }
}

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

  test('assigns placeholders consistently across calls', () => {
    const anonymizer = new SimpleWordAnonymizer(['one', 'two']);
    anonymizer.anonymize('one two');
    anonymizer.anonymize('one two');

    // Should have placeholders ANON_0, ANON_1 only
    const keys = Array.from((anonymizer as any).mapping.keys());
    expect(keys).toEqual(['ANON_0', 'ANON_1']);
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

  describe('Entropy Anonymization', () => {
    test('anonymizes high entropy strings', () => {
      // A random-looking string: "gH7p2K9wL4xN1" has high entropy
      // A common word: "password" has high-ish normalized entropy but we test it with a threshold
      const anonymizer = new SimpleWordAnonymizer([], 0.95, 8);
      const input = 'My key is gH7p2K9w@L4xN1 and my word is password';
      
      const anonymized = anonymizer.anonymize(input);
      
      // "gH7p2K9wL4xN1" (length 13, all unique chars) -> Hn = 1.0 > 0.95 -> ANON
      // "password" (length 8) -> Hn = 0.916 < 0.95 -> PRESERVED
      expect(anonymized).toContain('ANON_0');
      expect(anonymized).not.toContain('gH7p2K9w@L4xN1');
      expect(anonymized).toContain('password');

      const deanonymized = anonymizer.deanonymize(anonymized);
      expect(deanonymized).toBe(input);
    });

    test('uses same placeholder for same high entropy token', () => {
      const anonymizer = new SimpleWordAnonymizer([], 0.9, 8);
      const input = 'Key1: gH7p#2K9wL4xN91, Key2: gH7p#2K9wL4xN91';
      
      const anonymized = anonymizer.anonymize(input);
      expect(anonymized).toBe('Key1: ANON_0, Key2: ANON_0');
      
      const deanonymized = anonymizer.deanonymize(anonymized);
      expect(deanonymized).toBe(input);
    });

    test('does not anonymize identifiers (alphabetic or underscore)', () => {
      const anonymizer = new SimpleWordAnonymizer([], 0.8, 8);
      // "SimpleWordAnonymizer" is long and has reasonable entropy, but should be skipped.
      // "_privateIdentifier" should also be skipped.
      const input = 'Class SimpleWordAnonymizer has a member _privateIdentifier';
      
      const anonymized = anonymizer.anonymize(input);
      expect(anonymized).toBe(input);
    });

    test('does not anonymize snake_case identifiers', () => {
        const anonymizer = new SimpleWordAnonymizer([], 0.8, 8);
        
        const safe = 'long_variable_name_1';
        const stillSafe = 'long_Variable_name_2'; 
        
        const input = `Safe: ${safe}, Unsafe: ${stillSafe}`;
        const anonymized = anonymizer.anonymize(input);
        
        expect(anonymized).toContain(safe); // Should be preserved
        expect(anonymized).toContain(stillSafe); // Should be anonymized
        expect(anonymized).not.toContain('ANON_0');
    });

    test('anonymizes tokens with special characters like #, *, £, ?, ^', () => {
        const anonymizer = new SimpleWordAnonymizer([], 0.8, 8);
        const input = 'My secret is eT5*yu3^£uYv?BCh#126';
        
        const anonymized = anonymizer.anonymize(input);
        expect(anonymized).not.toContain('eT5*yu3^£uYv?BCh#126');
        expect(anonymized).toMatch(/My secret is ANON_\d+/);
    });

    test('getEntropy returns expected values for various strings', () => {
        const anonymizer = new SimpleWordAnonymizer([]);
        const getEntropy = (str: string) => (anonymizer as any).getEntropy(str);

        // Check code patterns
        // "console.log" -> 11 chars. Hn ≈ 0.822
        expect(getEntropy('console.log')).toBeCloseTo(0.822, 3);

        // "myFunction(arg)" -> 15 chars.
        // Hn ≈ 0.98
        expect(getEntropy('myFunction(arg)')).toBeGreaterThan(0.95);

        // Low entropy (repetitions)
        expect(getEntropy('aaaaa')).toBe(0);
        // "ababab": Hn ≈ 0.38685
        expect(getEntropy('ababab')).toBeCloseTo(0.38685, 4); 

        // Standard words (moderate entropy)
        // "password": 8 chars. Hn ≈ 0.91666
        expect(getEntropy('password')).toBeCloseTo(0.91666, 4); 
        
        // "correct": 7 chars. Hn ≈ 0.79644
        expect(getEntropy('correct')).toBeCloseTo(0.79644, 4);

        // High entropy (random strings)
        // all unique chars -> Hn = 1.0
        expect(getEntropy('0123456789')).toBeCloseTo(1.0, 2);

        // "SimpleWordAnonymizer": 20 chars. Hn ≈ 0.8612
        expect(getEntropy('SimpleWordAnonymizer')).toBeCloseTo(0.8612, 3);
        
        // Base64-like string (more randomness)
        // all unique chars -> Hn = 1.0
        const key = 'aB1+cD2/eF3g'; 
        expect(getEntropy(key)).toBe(1.0);
    });
  });

  describe('Anonymization Notifications', () => {
    test('notifies when anonymizing words', () => {
        const notifier = new MockNotifier();
        const anonymizer = new SimpleWordAnonymizer(['secret'], undefined, undefined, notifier);
        
        anonymizer.anonymize('This is a secret message');
        
        expect(notifier.notifications).toHaveLength(1);
        expect(notifier.notifications[0]).toEqual({
            original: 'secret',
            placeholder: 'ANON_0',
            type: 'word'
        });
    });

    test('notifies when anonymizing by entropy', () => {
        const notifier = new MockNotifier();
        const anonymizer = new SimpleWordAnonymizer([], 0.8, 8, notifier);
        const highEntropy = 'gH7p2K9wL4x8N1';
        
        anonymizer.anonymize(`Key: ${highEntropy}`);
        
        expect(notifier.notifications).toHaveLength(1);
        expect(notifier.notifications[0]).toEqual({
            original: highEntropy,
            placeholder: 'ANON_0',
            type: 'entropy'
        });
    });
  });
});
