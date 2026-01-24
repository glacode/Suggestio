import { EventBus } from '../../src/utils/eventBus.js';
import { 
    EventBusAnonymizationNotifier, 
    ANONYMIZATION_EVENT, 
} from '../../src/anonymizer/anonymizationNotifier.js';
import { AnonymizationEventPayload } from '../../src/types.js';

describe('EventBusAnonymizationNotifier', () => {
    let eventBus: EventBus;
    let notifier: EventBusAnonymizationNotifier;

    beforeEach(() => {
        eventBus = new EventBus();
        notifier = new EventBusAnonymizationNotifier(eventBus);
    });

    test('should emit anonymization event with correct payload', (done) => {
        const original = 'secretData';
        const placeholder = 'ANON_1';
        const type = 'word';

        eventBus.on(ANONYMIZATION_EVENT, (payload: AnonymizationEventPayload) => {
            try {
                expect(payload).toEqual({
                    original,
                    placeholder,
                    type
                });
                done();
            } catch (error) {
                done(error);
            }
        });

        notifier.notifyAnonymization(original, placeholder, type);
    });

    test('should emit anonymization event for entropy type', (done) => {
        const original = 'highEntropyData';
        const placeholder = 'ANON_2';
        const type = 'entropy';

        eventBus.on(ANONYMIZATION_EVENT, (payload: AnonymizationEventPayload) => {
            try {
                expect(payload).toEqual({
                    original,
                    placeholder,
                    type
                });
                done();
            } catch (error) {
                done(error);
            }
        });

        notifier.notifyAnonymization(original, placeholder, type);
    });
});