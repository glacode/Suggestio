import { EventEmitter } from 'events';
import { IDisposable, AppEvents } from '../types.js';

export type EventMap = Record<string, any>;

export type EventKey<E extends EventMap> = string & keyof E;
export type EventReceiver<T> = (params: T) => void;

export interface IEventBus<E extends EventMap = AppEvents> {
  on<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): IDisposable;
  once<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): void;
  off<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): void;
  emit<K extends EventKey<E>>(eventName: K, params: E[K]): void;
}

export class EventBus<E extends EventMap = AppEvents> implements IEventBus<E> {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(20);
  }

  public on<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): IDisposable {
    this.emitter.on(eventName, fn);
    return {
      dispose: () => {
        this.off(eventName, fn);
      }
    };
  }

  public once<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): void {
    this.emitter.once(eventName, fn);
  }

  public off<K extends EventKey<E>>(eventName: K, fn: EventReceiver<E[K]>): void {
    this.emitter.off(eventName, fn);
  }

  public emit<K extends EventKey<E>>(eventName: K, params: E[K]): void {
    this.emitter.emit(eventName, params);
  }
}
