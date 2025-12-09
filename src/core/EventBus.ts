/**
 * EventBus - Type-safe Event Communication System
 *
 * Provides a publish-subscribe pattern for component communication with:
 * - Type-safe events with payload validation
 * - Support for both sync and async event handlers
 * - One-time subscriptions via `once`
 * - Unsubscribe functionality
 *
 * @module core/EventBus
 */

import type { IEventBus } from '../types/services';
import type { EventType, EventPayload, EventHandler, Unsubscribe } from '../types/events';

/**
 * EventBus implementation
 *
 * Manages event subscriptions and dispatching.
 * Supports typed events with payloads and both sync/async handlers.
 */
export class EventBus implements IEventBus {
  /**
   * Map of event types to their registered handlers
   */
  private handlers = new Map<EventType, Set<EventHandler<EventType>>>();

  /**
   * Set of one-time handlers that should be removed after first call
   */
  private onceHandlers = new WeakSet<EventHandler<EventType>>();

  /**
   * Emit an event synchronously
   * All handlers are called, but async handlers are not awaited
   *
   * @param type - The event type to emit
   * @param payload - The event payload
   */
  emit<T extends EventType>(type: T, payload: EventPayload<T>): void {
    const eventHandlers = this.handlers.get(type);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }

    // Create a copy to avoid issues if handlers modify the set
    const handlersToCall = [...eventHandlers];

    for (const handler of handlersToCall) {
      try {
        // Call handler (ignore promise result for sync emit)
        (handler as EventHandler<T>)(payload);
      } catch {
        // Ignore errors in handlers for sync emit
      }

      // Remove one-time handlers after calling
      if (this.onceHandlers.has(handler)) {
        eventHandlers.delete(handler);
        this.onceHandlers.delete(handler);
      }
    }
  }

  /**
   * Emit an event and wait for all async handlers to complete
   *
   * @param type - The event type to emit
   * @param payload - The event payload
   * @returns Promise that resolves when all handlers complete
   */
  async emitAsync<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void> {
    const eventHandlers = this.handlers.get(type);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }

    // Create a copy to avoid issues if handlers modify the set
    const handlersToCall = [...eventHandlers];
    const promises: Promise<void>[] = [];

    for (const handler of handlersToCall) {
      try {
        const result = (handler as EventHandler<T>)(payload);
        // If handler returns a promise, track it
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch {
        // Ignore sync errors, continue with other handlers
      }

      // Remove one-time handlers after calling
      if (this.onceHandlers.has(handler)) {
        eventHandlers.delete(handler);
        this.onceHandlers.delete(handler);
      }
    }

    // Wait for all async handlers to complete
    if (promises.length > 0) {
      await Promise.all(promises.map(p => p.catch(() => {})));
    }
  }

  /**
   * Subscribe to an event
   *
   * @param type - The event type to subscribe to
   * @param handler - The handler function to call when event is emitted
   * @returns Unsubscribe function to remove the subscription
   */
  on<T extends EventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    const eventHandlers = this.handlers.get(type)!;
    eventHandlers.add(handler as EventHandler<EventType>);

    // Return unsubscribe function
    return () => {
      this.off(type, handler);
    };
  }

  /**
   * Subscribe to an event for one-time handling
   * The handler will be automatically removed after the first call
   *
   * @param type - The event type to subscribe to
   * @param handler - The handler function to call once
   * @returns Unsubscribe function to remove the subscription before it fires
   */
  once<T extends EventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    const typedHandler = handler as EventHandler<EventType>;
    
    // Mark as one-time handler
    this.onceHandlers.add(typedHandler);

    // Use regular subscription
    return this.on(type, handler);
  }

  /**
   * Unsubscribe a specific handler from an event
   *
   * @param type - The event type to unsubscribe from
   * @param handler - The handler function to remove
   */
  off<T extends EventType>(type: T, handler: EventHandler<T>): void {
    const eventHandlers = this.handlers.get(type);
    if (!eventHandlers) {
      return;
    }

    const typedHandler = handler as EventHandler<EventType>;
    eventHandlers.delete(typedHandler);

    // Also remove from once handlers if present
    this.onceHandlers.delete(typedHandler);

    // Clean up empty handler sets
    if (eventHandlers.size === 0) {
      this.handlers.delete(type);
    }
  }

  /**
   * Clear all subscriptions
   * Used during plugin unload to clean up all event handlers
   */
  clear(): void {
    this.handlers.clear();
    // WeakSet doesn't need explicit clearing - entries will be GC'd
  }
}
