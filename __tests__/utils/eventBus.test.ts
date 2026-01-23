import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventBus } from '../../src/utils/eventBus.js';

interface TestEvents {
  'test-event': { data: string };
  'number-event': { count: number };
}

describe('EventBus', () => {
  let bus: EventBus<TestEvents>;

  beforeEach(() => {
    bus = new EventBus<TestEvents>();
  });

  it('should subscribe and emit events', () => {
    const handler = jest.fn();

    bus.on('test-event', handler);
    bus.emit('test-event', { data: 'hello' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ data: 'hello' });
  });

  it('should allow disposing subscriptions', () => {
    const handler = jest.fn();

    const subscription = bus.on('test-event', handler);
    subscription.dispose();
    bus.emit('test-event', { data: 'world' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple listeners', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    bus.on('test-event', handler1);
    bus.on('test-event', handler2);
    bus.emit('test-event', { data: 'multi' });

    expect(handler1).toHaveBeenCalledWith({ data: 'multi' });
    expect(handler2).toHaveBeenCalledWith({ data: 'multi' });
  });

  it('should unsubscribe correctly using off', () => {
    const handler = jest.fn();
    bus.on('test-event', handler);
    bus.off('test-event', handler);
    bus.emit('test-event', { data: 'off' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle different event types', () => {
    const handler = jest.fn();
    bus.on('number-event', handler);
    bus.emit('number-event', { count: 42 });
    expect(handler).toHaveBeenCalledWith({ count: 42 });
  });
  
  it('once should only trigger once', () => {
      const handler = jest.fn();
      bus.once('test-event', handler);
      bus.emit('test-event', { data: 'once' });
      bus.emit('test-event', { data: 'twice' });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'once' });
  });

  it('should remove all listeners for a specific event', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    
    bus.on('test-event', handler1);
    bus.on('test-event', handler2);
    
    bus.removeAllListeners('test-event');
    bus.emit('test-event', { data: 'gone' });
    
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should remove all listeners for all events when no argument is provided', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    
    bus.on('test-event', handler1);
    bus.on('number-event', handler2);
    
    bus.removeAllListeners();
    bus.emit('test-event', { data: 'gone' });
    bus.emit('number-event', { count: 0 });
    
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});