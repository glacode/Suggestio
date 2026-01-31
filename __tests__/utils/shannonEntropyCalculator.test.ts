import { ShannonEntropyCalculator } from '../../src/utils/shannonEntropyCalculator.js';

describe('ShannonEntropyCalculator', () => {
    const calculator = new ShannonEntropyCalculator();

    test('returns expected values for various strings', () => {
        // Check code patterns
        // "console.log" -> 11 chars. Hn ≈ 0.822
        expect(calculator.getEntropy('console.log')).toBeCloseTo(0.822, 3);

        // "myFunction(arg)" -> 15 chars.
        // Hn ≈ 0.98
        expect(calculator.getEntropy('myFunction(arg)')).toBeGreaterThan(0.95);

        // Low entropy (repetitions)
        expect(calculator.getEntropy('aaaaa')).toBe(0);
        // "ababab": Hn ≈ 0.38685
        expect(calculator.getEntropy('ababab')).toBeCloseTo(0.38685, 4); 

        // Standard words (moderate entropy)
        // "password": 8 chars. Hn ≈ 0.91666
        expect(calculator.getEntropy('password')).toBeCloseTo(0.91666, 4); 
        
        // "correct": 7 chars. Hn ≈ 0.79644
        expect(calculator.getEntropy('correct')).toBeCloseTo(0.79644, 4);

        // High entropy (random strings)
        // all unique chars -> Hn = 1.0
        expect(calculator.getEntropy('0123456789')).toBeCloseTo(1.0, 2);

        // "SimpleWordAnonymizer": 20 chars. Hn ≈ 0.8612
        expect(calculator.getEntropy('SimpleWordAnonymizer')).toBeCloseTo(0.8612, 3);
        
        // Base64-like string (more randomness)
        // all unique chars -> Hn = 1.0
        const key = 'aB1+cD2/eF3g'; 
        expect(calculator.getEntropy(key)).toBe(1.0);
    });
});
