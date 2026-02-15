import { EventLogHandler } from '../../src/log/eventLogHandler.js';
import { EventBus } from '../../src/utils/eventBus.js';
import { createMockLogger } from '../testUtils.js';

describe('EventLogHandler', () => {
  it('should forward info log events to the logger', () => {
    const eventBus = new EventBus();
    const mockLogger = createMockLogger();
    new EventLogHandler(eventBus, mockLogger);

    eventBus.emit('log', { level: 'info', message: 'test info message' });

    expect(mockLogger.info).toHaveBeenCalledWith('test info message');
  });

  it('should forward debug log events to the logger', () => {
    const eventBus = new EventBus();
    const mockLogger = createMockLogger();
    new EventLogHandler(eventBus, mockLogger);

    eventBus.emit('log', { level: 'debug', message: 'test debug message' });

    expect(mockLogger.debug).toHaveBeenCalledWith('test debug message');
  });

  it('should forward warn log events to the logger', () => {
    const eventBus = new EventBus();
    const mockLogger = createMockLogger();
    new EventLogHandler(eventBus, mockLogger);

    eventBus.emit('log', { level: 'warn', message: 'test warn message' });

    expect(mockLogger.warn).toHaveBeenCalledWith('test warn message');
  });

  it('should forward error log events to the logger', () => {
    const eventBus = new EventBus();
    const mockLogger = createMockLogger();
    new EventLogHandler(eventBus, mockLogger);

    eventBus.emit('log', { level: 'error', message: 'test error message' });

    expect(mockLogger.error).toHaveBeenCalledWith('test error message');
  });
});
