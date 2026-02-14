import { IEventBus, ILogEventPayload } from '../types.js';
import { ILogger } from '../logger.js';

/**
 * EventLogHandler listens for 'log' events on the EventBus and forwards them
 * to a concrete ILogger implementation.
 * 
 * This acts as the "Sink" in our event-based logging system.
 */
export class EventLogHandler {
  constructor(
    private eventBus: IEventBus,
    private logger: ILogger
  ) {
    this.init();
  }

  private init(): void {
    this.eventBus.on('log', (payload: ILogEventPayload) => {
      this.handleLogEvent(payload);
    });
  }

  private handleLogEvent(payload: ILogEventPayload): void {
    const { level, message } = payload;
    this.logger[level](message);
  }
}
