import { EventBus } from '../../src/utils/eventBus.js';
import { EventLogHandler } from '../../src/utils/eventLogHandler.js';
import { EventBusAnonymizationNotifier, ANONYMIZATION_EVENT } from '../../src/anonymizer/anonymizationNotifier.js';
import { createMockLogger } from '../testUtils.js';
import { EXTENSION_LOGS } from '../../src/constants/messages.js';
import { IAnonymizationEventPayload } from '../../src/types.js';

describe('Logging Integration', () => {
  it('should log anonymization events through the EventBus and EventLogHandler', () => {
    const eventBus = new EventBus();
    const mockLogger = createMockLogger();
    
    // 1. Initialize the Sink (Handler)
    new EventLogHandler(eventBus, mockLogger);

    // 2. Setup the Listener (Mirroring extension.ts logic)
    eventBus.on(ANONYMIZATION_EVENT, (payload: IAnonymizationEventPayload) => {
      eventBus.emit('log', { 
        level: 'info', 
        message: EXTENSION_LOGS.ANONYMIZED(payload.original, payload.placeholder, payload.type) 
      });
    });

    // 3. Trigger an event via the Notifier
    const notifier = new EventBusAnonymizationNotifier(eventBus);
    notifier.notifyAnonymization('secret', 'ANON_1', 'word');

    // 4. Verify the Sink received the log
    const expectedMessage = EXTENSION_LOGS.ANONYMIZED('secret', 'ANON_1', 'word');
    expect(mockLogger.info).toHaveBeenCalledWith(expectedMessage);
  });
});
