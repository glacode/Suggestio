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
      // A common word: "password" has lower entropy
      const anonymizer = new SimpleWordAnonymizer([], 3.0, 8);
      const input = 'My key is gH7p2K9wL4xN1 and my word is password';
      
      const anonymized = anonymizer.anonymize(input);
      
      // "gH7p2K9wL4xN1" should be anonymized (length 13, high entropy)
      // "password" should NOT be anonymized (length 8, but lower entropy)
      expect(anonymized).toContain('ANON_0');
      expect(anonymized).not.toContain('gH7p2K9wL4xN1');
      expect(anonymized).toContain('password');

      const deanonymized = anonymizer.deanonymize(anonymized);
      expect(deanonymized).toBe(input);
    });

    test('uses same placeholder for same high entropy token', () => {
      const anonymizer = new SimpleWordAnonymizer([], 3.0, 8);
      const input = 'Key1: gH7p2K9wL4xN1, Key2: gH7p2K9wL4xN1';
      
      const anonymized = anonymizer.anonymize(input);
      expect(anonymized).toBe('Key1: ANON_0, Key2: ANON_0');
      
      const deanonymized = anonymizer.deanonymize(anonymized);
      expect(deanonymized).toBe(input);
    });

    test('does not anonymize identifiers (alphabetic or underscore)', () => {
      const anonymizer = new SimpleWordAnonymizer([], 3.0, 8);
      // "SimpleWordAnonymizer" is long and has reasonable entropy, but should be skipped.
      // "_privateIdentifier" should also be skipped.
      const input = 'Class SimpleWordAnonymizer has a member _privateIdentifier';
      
      const anonymized = anonymizer.anonymize(input);
      expect(anonymized).toBe(input);
    });

    test('does not anonymize identifiers ending in a single digit', () => {
        const anonymizer = new SimpleWordAnonymizer([], 3.5, 8);
        
        // "long_variable_name_1" -> high length, potentially high entropy, but ends in single digit -> SKIP
        // "long_variable_name_12" -> ends in 2 digits -> PROCESS (if entropy high enough)
        
        const safe = 'long_variable_name_1';
        const unsafe = 'long_variable_name_12'; 

        // Let's ensure unsafe actually has high enough entropy for the test
        // "long_variable_name_12" -> l,o,n,g,_,v,a,r,i,b,e,m,1,2.
        // length 21.
        // It has decent entropy.
        
        const input = `Safe: ${safe}, Unsafe: ${unsafe}`;
        const anonymized = anonymizer.anonymize(input);
        
        expect(anonymized).toContain(safe); // Should be preserved
        expect(anonymized).not.toContain(unsafe); // Should be anonymized
        expect(anonymized).toContain('ANON_0');
    });

    test('getEntropy returns expected values for various strings', () => {
        const anonymizer = new SimpleWordAnonymizer([]);
        const getEntropy = (str: string) => (anonymizer as any).getEntropy(str);

        // Low entropy (repetitions)
        expect(getEntropy('aaaaa')).toBe(0);
        // 2 distinct chars, length 6. p('a')=0.5, p('b')=0.5. - (0.5*-1 + 0.5*-1) = 1.0
        expect(getEntropy('ababab')).toBeCloseTo(1.0); 

        // Standard words (moderate entropy)
        // "password": 8 chars. s:2, others:1. 
        // Entropy = - [ 2*(0.25*log2(0.25)) + 6*(0.125*log2(0.125)) ]
        // = - [ 0.5 * -2 + 0.75 * -3 ] = - [ -1 - 2.25 ] = 3.25?
        // Wait. s:2 (freq 2/8=0.25). 1 instance of 's' contributes p*log(p).
        // There are 8 positions? No, loop over frequencies.
        // frequencies: s:2, p:1, a:1, w:1, o:1, r:1, d:1.
        // term for s: 0.25 * log2(0.25) = 0.25 * -2 = -0.5.
        // term for others: 0.125 * log2(0.125) = 0.125 * -3 = -0.375.
        // sum = -0.5 + 6 * (-0.375) = -0.5 - 2.25 = -2.75.
        // Entropy = -(-2.75) = 2.75.
        expect(getEntropy('password')).toBeCloseTo(2.75); 
        
        // "correct": 7 chars. c:2, r:2, o:1, e:1, t:1.
        // p(c)=2/7, p(r)=2/7. p(others)=1/7.
        // term(c) = 2/7 * log2(2/7) ≈ 0.2857 * -1.807 ≈ -0.516
        // term(r) = -0.516
        // term(o) = 1/7 * log2(1/7) ≈ 0.1428 * -2.807 ≈ -0.401
        // sum = 2*(-0.516) + 3*(-0.401) = -1.032 - 1.203 = -2.235
        // Entropy = 2.235
        expect(getEntropy('correct')).toBeCloseTo(2.23, 1);

        // High entropy (random strings)
        // 10 distinct chars: log2(10) ≈ 3.32
        expect(getEntropy('0123456789')).toBeCloseTo(3.32, 2);

        // High entropy because many unique chars
        expect(getEntropy('SimpleWordAnonymizer')).toBeCloseTo(3.72, 2);
        // Lowering S W A to lowercase gives same unique char count
        expect(getEntropy('simplewordanonymizer')).toBeCloseTo(3.72, 2);

        
        // Base64-like string (more randomness)
        // 12 unique chars. log2(12) ≈ 3.58
        const key = 'aB1+cD2/eF3g'; 
        expect(getEntropy(key)).toBeCloseTo(3.58, 2);
    });
  });
});
