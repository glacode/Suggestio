import { SimpleWordAnonymizer } from '../../src/anonymizer/simpleWordAnonymizer.js';
import { IAnonymizationNotifier } from '../../src/types.js';

class MockNotifier implements IAnonymizationNotifier {
    public notifications: { original: string; placeholder: string; type: 'word' | 'entropy' }[] = [];

    notifyAnonymization(original: string, placeholder: string, type: 'word' | 'entropy'): void {
        this.notifications.push({ original, placeholder, type });
    }
}

describe('Anonymization Notifier Behavior', () => {
    test('should notify for every occurrence of a sensitive word across multiple calls', () => {
        const notifier = new MockNotifier();
        const anonymizer = new SimpleWordAnonymizer(['secret'], undefined, undefined, notifier);
        
        // First call - should notify
        anonymizer.anonymize('First secret message');
        expect(notifier.notifications).toHaveLength(1);
        expect(notifier.notifications[0].original).toBe('secret');

        // Second call with same word - currently this does NOT notify because it's already in the mapping
        anonymizer.anonymize('Second secret message');
        
        // This expectation will FAIL with the current implementation
        expect(notifier.notifications).toHaveLength(2);
        expect(notifier.notifications[1].original).toBe('secret');
    });

    test('should notify for every occurrence of high-entropy tokens across multiple calls', () => {
        const notifier = new MockNotifier();
        const anonymizer = new SimpleWordAnonymizer([], 0.8, 8, notifier);
        const highEntropy = 'gH7p2K9wL4x8N1';
        
        // First call
        anonymizer.anonymize(`Key: ${highEntropy}`);
        expect(notifier.notifications).toHaveLength(1);
        
        // Second call
        anonymizer.anonymize(`Another usage: ${highEntropy}`);
        
        // This expectation will FAIL with the current implementation
        expect(notifier.notifications).toHaveLength(2);
    });
});
