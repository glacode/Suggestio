import { IEventBus } from '../types.js';
import { LogLevelString } from './logger.js';

/**
 * Creates a logger-like object that emits 'log' events to the provided EventBus.
 * 
 * This centralizes the event-based logging logic used by components.
 * 
 * @param eventBus The event bus to emit log events to.
 * @returns An object with debug, info, warn, and error methods.
 */
export function createEventLogger(eventBus: IEventBus): Record<LogLevelString, (message: string) => void> {
  return {
    debug: (message: string) => eventBus.emit('log', { level: 'debug', message }),
    info: (message: string) => eventBus.emit('log', { level: 'info', message }),
    warn: (message: string) => eventBus.emit('log', { level: 'warn', message }),
    error: (message: string) => eventBus.emit('log', { level: 'error', message }),
  };
}
