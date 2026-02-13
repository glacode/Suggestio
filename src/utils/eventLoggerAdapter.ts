import { IEventBus } from '../types.js';
import { ILogger, LogLevel } from '../logger.js';

/**
 * EventLoggerAdapter implements ILogger by emitting events to the EventBus.
 * 
 * This allows components to keep using the ILogger interface while the
 * actual logging is decoupled via the EventBus.
 */
export class EventLoggerAdapter implements ILogger {
  constructor(private eventBus: IEventBus) {}

  public debug(message: string): void {
    this.eventBus.emit('log', { level: 'debug', message });
  }

  public info(message: string): void {
    this.eventBus.emit('log', { level: 'info', message });
  }

  public warn(message: string): void {
    this.eventBus.emit('log', { level: 'warn', message });
  }

  public error(message: string): void {
    this.eventBus.emit('log', { level: 'error', message });
  }

  public setLogLevel(_level: LogLevel): void {
    // Log level is handled by the EventLogHandler's sink (the concrete logger)
    // or we could implement filtering here in the future if needed.
  }
}
