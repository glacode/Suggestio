import { EventLoggerAdapter } from '../../src/utils/eventLoggerAdapter.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { ILogEventPayload } from '../../src/types.js';

describe('EventLoggerAdapter', () => {
  let eventBus: EventBus;
  let adapter: EventLoggerAdapter;
  let capturedEvents: ILogEventPayload[];

  beforeEach(() => {
    eventBus = new EventBus();
    adapter = new EventLoggerAdapter(eventBus);
    capturedEvents = [];
    eventBus.on('log', (payload) => capturedEvents.push(payload));
  });

  it('should emit a log event for info()', () => {
    adapter.info('info message');
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]).toEqual({ level: 'info', message: 'info message' });
  });

  it('should emit a log event for debug()', () => {
    adapter.debug('debug message');
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]).toEqual({ level: 'debug', message: 'debug message' });
  });

  it('should emit a log event for warn()', () => {
    adapter.warn('warn message');
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]).toEqual({ level: 'warn', message: 'warn message' });
  });

  it('should emit a log event for error()', () => {
    adapter.error('error message');
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]).toEqual({ level: 'error', message: 'error message' });
  });
});
