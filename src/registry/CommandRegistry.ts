/**
 * CommandRegistry - Command Handler Registration and Routing
 *
 * Provides command handler management with:
 * - Handler registration and routing (Requirement 5.2, 5.3)
 * - Error isolation - emit error events without crashing (Requirement 5.5)
 *
 * @module registry/CommandRegistry
 */

import type { IEventBus } from '../types/services';
import type { ICommandRegistry, ICommandHandler, ParsedCommand, CommandType } from '../types/commands';
import { EventType } from '../types/events';
import { getLogger } from '../services/Logger';

// Re-export command type constants for convenience
export {
  MAPPING_COMMAND_TYPES,
  EXECUTOR_COMMAND_TYPES,
} from '../types/commands';

const log = getLogger('registry');

/**
 * CommandRegistry implementation
 *
 * Manages command handlers and routes parsed commands to the appropriate handler.
 * Supports error isolation by emitting error events instead of crashing.
 */
export class CommandRegistry implements ICommandRegistry {
  /** Map of command types to their registered handlers */
  private handlers: Map<CommandType, ICommandHandler[]> = new Map();

  /** All unique handlers */
  private allHandlers: ICommandHandler[] = [];

  /** EventBus for emitting error events */
  private eventBus: IEventBus | null = null;

  constructor(eventBus?: IEventBus) {
    this.eventBus = eventBus || null;
  }

  /** Set the EventBus for error event emission */
  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Register a command handler
   * @param handler - Handler implementing ICommandHandler interface
   */
  register(handler: ICommandHandler): void {
    if (!handler.supportedTypes) {
      log.warn('Handler does not have supportedTypes property');
      return;
    }

    for (const type of handler.supportedTypes) {
      const existing = this.handlers.get(type) || [];
      existing.push(handler);
      this.handlers.set(type, existing);
    }

    if (!this.allHandlers.includes(handler)) {
      this.allHandlers.push(handler);
    }
  }

  /** Unregister a command handler */
  unregister(handler: ICommandHandler): void {
    for (const type of handler.supportedTypes) {
      const handlers = this.handlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
        if (handlers.length === 0) {
          this.handlers.delete(type);
        }
      }
    }

    const index = this.allHandlers.indexOf(handler);
    if (index !== -1) {
      this.allHandlers.splice(index, 1);
    }
  }

  /**
   * Route a command to the appropriate handler
   * Implements error isolation - emits error events instead of crashing
   */
  async route(command: ParsedCommand): Promise<void> {
    const handlers = this.handlers.get(command.type) || [];
    const handler = handlers.find((h) => h.canHandle(command));

    if (handler) {
      try {
        await handler.handle(command);
      } catch (error) {
        this.emitError(error as Error, `CommandRegistry.route: ${command.type}`);
      }
      return;
    }

    log.warn(`No handler found for command type: ${command.type}`);
  }

  /** Get all registered handlers */
  getHandlers(): ICommandHandler[] {
    return [...this.allHandlers];
  }

  /** Check if a handler is registered for a command type */
  hasHandler(type: CommandType): boolean {
    const handlers = this.handlers.get(type);
    return handlers !== undefined && handlers.length > 0;
  }

  /** Get count of registered command types */
  getRegisteredTypeCount(): number {
    return this.handlers.size;
  }

  /** Cleanup all handlers */
  cleanup(): void {
    for (const handler of this.allHandlers) {
      try {
        handler.cleanup();
      } catch (error) {
        this.emitError(error as Error, 'CommandRegistry.cleanup');
      }
    }

    this.handlers.clear();
    this.allHandlers = [];
  }

  private emitError(error: Error, context: string): void {
    if (this.eventBus) {
      this.eventBus.emit(EventType.ERROR_OCCURRED, {
        error,
        context,
        severity: 'error',
      });
    } else {
      log.error(`${context}:`, error);
    }
  }
}
