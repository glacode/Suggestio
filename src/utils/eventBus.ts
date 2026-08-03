import { EventEmitter } from 'events';
import { IDisposable, IAppEvents } from '../types.js';
import { SYSTEM_CONFIG } from '../constants/system.js';

/**
 * ---------------------
 * An Event Bus is a design pattern that allows different parts of your application
 * to communicate with each other WITHOUT being directly connected (decoupled).
 *
 * WHY USE AN EVENT BUS?
 * ---------------------
 * 1. DECOUPLING: Module A doesn't need to import Module B to talk to it
 * 2. FLEXIBILITY: Add/remove listeners without changing the emitter
 * 3. TESTING: Easy to mock - just listen for events in tests
 * 4. SCALABILITY: Many listeners can react to the same event
 */

// ============================================================================
// TYPE DEFINITIONS - Understanding the TypeScript generics
// ============================================================================

/**
 * EventMap - A dictionary that defines WHAT events exist and WHAT data they carry
 *
 * Example:
 *   type MyEvents = {
 *     'user:login': { userId: string; timestamp: Date };
 *     'user:logout': { userId: string };
 *     'data:loaded': string[];
 *   };
 *
 * This gives us TYPE SAFETY - TypeScript will error if you:
 * - Emit an event that doesn't exist in the map
 * - Pass the wrong data shape for an event
 * - Listen for an event that doesn't exist
 */
export type EventMap = Record<string, any>;

/**
 * EventKey<E> - Extracts just the KEYS (event names) from an EventMap
 *
 * If EventMap = { 'user:login': UserData; 'user:logout': LogoutData }
 * Then EventKey<EventMap> = 'user:login' | 'user:logout'
 *
 * The "& string" ensures we only get string keys (not symbols)
 */
export type EventKey<E extends EventMap> = keyof E & string;

/**
 * EventReceiver<T> - The signature for a callback function that handles an event
 *
 * When an event fires, this function receives the event's payload (params)
 * and returns void (nothing).
 *
 * Example:
 *   const handleLogin: EventReceiver<{ userId: string }> = (params) => {
 *     console.log(`User ${params.userId} logged in`);
 *   };
 */
export type EventReceiver<T> = (params: T) => void;

/**
 * IEventBus<E> - The public interface (contract) for our Event Bus
 *
 * Generics explanation:
 * - <E extends EventMap = IAppEvents> means:
 *   - E must be an EventMap (or extend one)
 *   - If not provided, default to IAppEvents (defined in types.ts)
 *
 * This interface defines 5 core methods every event bus should have:
 */
export interface IEventBus<E extends EventMap = IAppEvents> {
  /**
   * SUBSCRIBE: Listen for an event continuously
   *
   * @param eventName - The name of the event to listen for (must exist in E)
   * @param fn - Callback function that receives the event data
   * @returns IDisposable - An object with a dispose() method to unsubscribe
   *
   * USAGE:
   *   const subscription = eventBus.on('user:login', (data) => {
   *     console.log(data.userId);
   *   });
   *
   *   // Later, when you want to stop listening:
   *   subscription.dispose();
   */
  on<K extends EventKey<E>>(
    eventName: K,
    fn: EventReceiver<E[K]>
  ): IDisposable;

  /**
   * SUBSCRIBE ONCE: Listen for an event exactly ONE time
   *
   * After the event fires once, the listener is automatically removed.
   * Useful for one-time setup, waiting for initialization, etc.
   *
   * @param eventName - The name of the event to listen for
   * @param fn - Callback function (called at most once)
   * @returns IDisposable - Call dispose() to cancel before the event fires
   *
   * USAGE:
   *   const subscription = eventBus.once('app:ready', () => {
   *     startApplication();
   *   });
   */
  once<K extends EventKey<E>>(
    eventName: K,
    fn: EventReceiver<E[K]>
  ): IDisposable;

  /**
   * UNSUBSCRIBE: Remove a specific listener
   *
   * You must pass the EXACT same function reference that you passed to on()/once()
   * This is why arrow functions defined inline can't be removed later:
   *
   * WRONG:
   *   eventBus.on('event', () => {}); // Can't remove - no reference!
   *
   * RIGHT:
   *   const handler = (data) => {};
   *   eventBus.on('event', handler);
   *   eventBus.off('event', handler); // Works!
   *
   * @param eventName - The event name
   * @param fn - The exact function reference to remove
   */
  off<K extends EventKey<E>>(
    eventName: K,
    fn: EventReceiver<E[K]>
  ): void;

  /**
   * REMOVE ALL LISTENERS: Nuclear option - remove everything
   *
   * @param eventName - Optional. If provided, removes listeners for ONLY that event.
   *                    If omitted, removes ALL listeners for ALL events.
   *
   * USE WITH CAUTION: This can break other parts of the app that are listening!
   * Typically used during cleanup/shutdown.
   */
  removeAllListeners<K extends EventKey<E>>(eventName?: K): void;

  /**
   * EMIT: Fire/publish/broadcast an event to all listeners
   *
   * This is how you SEND an event. All subscribers to this event name
   * will have their callbacks executed with the provided data.
   *
   * The complex type signature handles two cases:
   * 1. Events WITH required data: emit('user:login', { userId: '123' })
   * 2. Events WITHOUT data (void/undefined): emit('app:ready') or emit('app:ready', undefined)
   *
   * @param eventName - The event to fire
   * @param args - The event payload (type-checked against EventMap)
   *
   * USAGE:
   *   // Event with data
   *   eventBus.emit('user:login', { userId: '123', timestamp: new Date() });
   *
   *   // Event without data (void)
   *   eventBus.emit('app:shutdown');
   */
  emit<K extends EventKey<E>>(
    eventName: K,
    ...args: E[K] extends void | undefined ? [params?: E[K]] : [params: E[K]]
  ): void;
}

// ============================================================================
// EVENT BUS IMPLEMENTATION
// ============================================================================

/**
 * EventBus<E> - Concrete implementation of IEventBus
 *
 * WRAPS Node.js's built-in EventEmitter with:
 * - Type safety (via generics)
 * - Memory leak protection (max listeners limit)
 * - Convenient IDisposable return values for easy cleanup
 * - Consistent API across the application
 *
 * @typeParam E - The EventMap defining valid events (defaults to IAppEvents)
 */
export class EventBus<E extends EventMap = IAppEvents> implements IEventBus<E> {
  /**
   * The underlying EventEmitter instance from Node.js 'events' module
   *
   * We keep this PRIVATE - consumers should ONLY interact via our public methods
   * (on, once, off, removeAllListeners, emit). This lets us:
   * - Change implementation later without breaking callers
   * - Add logging, validation, or metrics
   * - Enforce our typing system
   */
  private emitter = new EventEmitter();

  /**
   * Constructor - Sets up memory leak protection
   *
   * Node.js EventEmitter warns when more than 10 listeners are added to one event
   * (to catch accidental memory leaks). We increase this to SYSTEM_CONFIG value.
   *
   * WHY THIS MATTERS:
   * - If you forget to call dispose()/off(), listeners accumulate
   * - This causes memory leaks and the warning helps catch it
   * - We set a reasonable higher limit for complex apps
   */
  constructor() {
    // Increase the default max listeners (default is 10) to our configured value
    // This prevents "MaxListenersExceededWarning" in legitimate high-listener scenarios
    this.emitter.setMaxListeners(SYSTEM_CONFIG.EVENT_BUS_MAX_LISTENERS);
  }

  /**
   * SUBSCRIBE to an event (continuous listening)
   *
   * @param eventName - The event to listen for (type-safe: must exist in E)
   * @param fn - Callback that receives typed event data (E[K] = the payload type)
   * @returns IDisposable - Call .dispose() to unsubscribe
   *
   * HOW IT WORKS:
   * 1. Registers the callback with the internal emitter
   * 2. Returns an object with a dispose() method
   * 3. Calling dispose() calls off() internally to clean up
   *
   * WHY RETURNS IDisposable:
   * - Pattern used throughout VS Code and modern TypeScript
   * - Makes cleanup explicit and consistent
   * - Works great with try/finally or using declarations
   *
   * EXAMPLE:
   *   const sub = eventBus.on('user:login', (data) => {
   *     updateUI(data.userId);
   *   });
   *
   *   // In a React component cleanup or class destructor:
   *   sub.dispose();
   */
  public on<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): IDisposable {
    // Register the listener with Node's EventEmitter
    this.emitter.on(eventName, fn);

    // Return a disposable object for easy cleanup
    // This is the "subscription" - hold onto it to unsubscribe later
    return {
      dispose: () => {
        // When dispose() is called, remove this specific listener
        this.off(eventName, fn);
      }
    };
  }

  /**
   * SUBSCRIBE to an event ONCE (auto-unsubscribes after first fire)
   *
   * @param eventName - The event to listen for
   * @param fn - Callback (will be called at most once)
   * @returns IDisposable - Call .dispose() to cancel before event fires
   *
   * USE CASES:
   * - Waiting for initialization: once('app:ready', startApp)
   * - One-time setup: once('config:loaded', applyConfig)
   * - Promise-like patterns: wrap in a Promise for async/await
   *
   * NOTE: If you call dispose() before the event fires, the callback NEVER runs
   */
  public once<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): IDisposable {
    // EventEmitter's once() automatically removes the listener after first call
    this.emitter.once(eventName, fn);

    // Still return IDisposable so caller can cancel if needed
    return {
      dispose: () => {
        this.off(eventName, fn);
      }
    };
  }

  /**
   * UNSUBSCRIBE a specific listener
   *
   * @param eventName - The event name
   * @param fn - The EXACT function reference passed to on()/once()
   *
   * IMPORTANT: You must pass the same function reference!
   * This won't work:
   *   eventBus.on('event', () => console.log('hi'));
   *   eventBus.off('event', () => console.log('hi')); // Different function!
   *
   * This WILL work:
   *   const handler = () => console.log('hi');
   *   eventBus.on('event', handler);
   *   eventBus.off('event', handler); // Same reference!
   */
  public off<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): void {
    this.emitter.off(eventName, fn);
  }

  /**
   * REMOVE ALL LISTENERS for an event (or all events)
   *
   * @param eventName - Optional. If provided, clears only that event.
   *                    If omitted, clears ALL events (nuclear option).
   *
   * WARNING: Using without eventName removes listeners from OTHER parts of the app!
   * Only use during full application shutdown or testing cleanup.
   *
   * SAFE USAGE:
   *   // Good - clean up just your event
   *   eventBus.removeAllListeners('my:custom:event');
   *
   *   // Dangerous - wipes everyone's listeners
   *   eventBus.removeAllListeners(); // Only in app shutdown!
   */
  public removeAllListeners<K extends EventKey<E>>(eventName?: K): void {
    if (eventName) {
      // Remove all listeners for a specific event only
      this.emitter.removeAllListeners(eventName);
    } else {
      // Remove ALL listeners for ALL events - use sparingly!
      this.emitter.removeAllListeners();
    }
  }

  /**
   * EMIT (fire/publish/broadcast) an event
   *
   * @param eventName - The event to fire (type-safe)
   * @param args - Event payload (type-checked against EventMap)
   *
   * HOW IT WORKS:
   * 1. Looks up all listeners registered for eventName
   * 2. Calls each listener with the provided args
   * 3. Listeners are called SYNCHRONOUSLY in registration order
   * 4. If any listener throws, remaining listeners still run (but error propagates)
   *
   * TYPE SAFETY EXPLAINED:
   * The complex conditional type handles two event types:
   *
   * 1. Events WITH data (e.g., 'user:login': { userId: string })
   *    - Must provide the data: emit('user:login', { userId: '123' })
   *    - TypeScript errors if you omit it or pass wrong shape
   *
   * 2. Events WITHOUT data (e.g., 'app:ready': void)
   *    - Can call with no args: emit('app:ready')
   *    - Or with undefined: emit('app:ready', undefined)
   *    - TypeScript errors if you pass actual data
   *
   * EXAMPLES:
   *   // Event with required payload
   *   eventBus.emit('user:login', { userId: '123', roles: ['admin'] });
   *
   *   // Event without payload (void)
   *   eventBus.emit('app:shutdown');
   *   eventBus.emit('config:reloaded'); // No second argument needed
   */
  public emit<K extends EventKey<E>>(
    eventName: K,
    ...args: E[K] extends void | undefined ? [params?: E[K]] : [params: E[K]]
  ): void {
    // Simply delegate to the internal EventEmitter
    // All the type safety is handled at compile time
    this.emitter.emit(eventName, ...args);
  }
}