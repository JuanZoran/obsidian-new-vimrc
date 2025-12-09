/**
 * CommandRegistry - Enhanced Command Handler Registration and Routing
 *
 * Provides command handler management with:
 * - Handler registration and routing (Requirement 5.2, 5.3)
 * - Error isolation - emit error events without crashing (Requirement 5.5)
 * - Support for both new ICommandHandler and legacy CommandHandler interfaces
 *
 * @module registry/CommandRegistry
 */

import type { IEventBus } from '../types/services';
import type {
  ICommandRegistry,
  ICommandHandler,
  ParsedCommand,
  CommandType,
} from '../types/commands';
import { EventType } from '../types/events';

// Legacy types for backward compatibility
import type { HandlerContext, CommandHandler as LegacyCommandHandler } from '../types';

/**
 * Enhanced CommandRegistry implementation
 *
 * Manages command handlers and routes parsed commands to the appropriate handler.
 * Supports error isolation by emitting error events instead of crashing.
 */
export class CommandRegistry implements ICommandRegistry {
  /**
   * Map of command types to their registered handlers (new interface)
   */
  private handlers: Map<CommandType, ICommandHandler[]> = new Map();

  /**
   * Map of command types to legacy handlers
   */
  private legacyHandlers: Map<CommandType, LegacyCommandHandler[]> = new Map();

  /**
   * All unique handlers (new interface)
   */
  private allHandlers: ICommandHandler[] = [];

  /**
   * All unique legacy handlers
   */
  private allLegacyHandlers: LegacyCommandHandler[] = [];

  /**
   * EventBus for emitting error events (optional for backward compatibility)
   */
  private eventBus: IEventBus | null = null;

  /**
   * Legacy handler context (for backward compatibility)
   */
  private legacyContext: HandlerContext | null = null;

  /**
   * Create a new CommandRegistry
   *
   * @param eventBus - Optional EventBus for error event emission
   */
  constructor(eventBus?: IEventBus) {
    this.eventBus = eventBus || null;
  }

  /**
   * Set the EventBus for error event emission
   *
   * @param eventBus - The EventBus instance
   */
  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Set the legacy handler context
   *
   * @param context - The handler context for legacy handlers
   */
  setLegacyContext(context: HandlerContext): void {
    this.legacyContext = context;
  }

  /**
   * Register a command handler
   * Supports both new ICommandHandler interface and legacy (type, handler) signature
   *
   * @param typeOrHandler - Either a CommandType (legacy) or ICommandHandler (new)
   * @param handler - The handler to register (only for legacy signature)
   */
  register(typeOrHandler: CommandType | ICommandHandler, handler?: LegacyCommandHandler): void {
    // Check if using legacy signature: register(type, handler)
    if (typeof typeOrHandler === 'string' && handler) {
      this.registerLegacy(typeOrHandler as CommandType, handler);
      return;
    }

    // New interface: register(handler)
    const newHandler = typeOrHandler as ICommandHandler;
    if (!newHandler.supportedTypes) {
      console.warn('[Vimrc] Handler does not have supportedTypes property');
      return;
    }

    for (const type of newHandler.supportedTypes) {
      const existing = this.handlers.get(type) || [];
      existing.push(newHandler);
      this.handlers.set(type, existing);
    }

    // Track unique handlers
    if (!this.allHandlers.includes(newHandler)) {
      this.allHandlers.push(newHandler);
    }
  }

  /**
   * Unregister a command handler
   *
   * @param handler - The handler to unregister
   */
  unregister(handler: ICommandHandler): void {
    // Remove from all type mappings
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

    // Remove from allHandlers
    const index = this.allHandlers.indexOf(handler);
    if (index !== -1) {
      this.allHandlers.splice(index, 1);
    }
  }

  /**
   * Route a command to the appropriate handler
   * Implements error isolation - emits error events instead of crashing
   *
   * @param command - The parsed command to route
   */
  async route(command: ParsedCommand): Promise<void> {
    // Try new interface handlers first
    const handlers = this.handlers.get(command.type) || [];
    const handler = handlers.find((h) => h.canHandle(command));

    if (handler) {
      try {
        await handler.handle(command);
      } catch (error) {
        this.emitError(error as Error, `CommandRegistry.route: ${command.type}`);
        // Error isolation: don't rethrow, just emit event
      }
      return;
    }

    // Fall back to legacy handlers
    const legacyHandlers = this.legacyHandlers.get(command.type) || [];
    const legacyHandler = legacyHandlers.find((h) => h.canHandle(command));

    if (legacyHandler && this.legacyContext) {
      try {
        await legacyHandler.handle(command, this.legacyContext);
      } catch (error) {
        this.emitError(error as Error, `CommandRegistry.route (legacy): ${command.type}`);
        // Error isolation: don't rethrow, just emit event
      }
      return;
    }

    // No handler found - log warning but don't crash
    console.warn(`[Vimrc] No handler found for command type: ${command.type}`);
  }

  /**
   * Get all registered handlers (new interface)
   * Note: For backward compatibility, this returns legacy handlers cast to ICommandHandler[]
   * when only legacy handlers are registered. Use getNewHandlers() for strict typing.
   *
   * @returns Array of all unique handlers
   */
  getHandlers(): ICommandHandler[] {
    // For backward compatibility, return legacy handlers if they exist and no new handlers
    if (this.allHandlers.length === 0 && this.allLegacyHandlers.length > 0) {
      // Cast legacy handlers - they have compatible structure for most use cases
      return [...this.allLegacyHandlers] as unknown as ICommandHandler[];
    }
    return [...this.allHandlers];
  }

  /**
   * Get all new interface handlers (strict typing)
   *
   * @returns Array of all unique new interface handlers
   */
  getNewHandlers(): ICommandHandler[] {
    return [...this.allHandlers];
  }

  /**
   * Get all legacy handlers
   * Used for backward compatibility with existing code
   *
   * @returns Array of all unique legacy handlers
   */
  getLegacyHandlers(): LegacyCommandHandler[] {
    return [...this.allLegacyHandlers];
  }

  /**
   * Cleanup all handlers
   */
  cleanup(): void {
    // Cleanup new interface handlers
    for (const handler of this.allHandlers) {
      try {
        handler.cleanup();
      } catch (error) {
        this.emitError(error as Error, 'CommandRegistry.cleanup');
      }
    }

    // Cleanup legacy handlers
    for (const handler of this.allLegacyHandlers) {
      if (handler.cleanup) {
        try {
          handler.cleanup();
        } catch (error) {
          this.emitError(error as Error, 'CommandRegistry.cleanup (legacy)');
        }
      }
    }

    this.handlers.clear();
    this.legacyHandlers.clear();
    this.allHandlers = [];
    this.allLegacyHandlers = [];
  }

  // ============================================
  // Legacy API for backward compatibility
  // ============================================

  /**
   * Register a legacy command handler for a specific command type
   * @deprecated Use register(handler: ICommandHandler) instead
   *
   * @param type - The command type this handler processes
   * @param handler - The handler to register
   */
  registerLegacy(type: CommandType, handler: LegacyCommandHandler): void {
    const existing = this.legacyHandlers.get(type) || [];
    existing.push(handler);
    this.legacyHandlers.set(type, existing);

    // Track unique handlers
    if (!this.allLegacyHandlers.includes(handler)) {
      this.allLegacyHandlers.push(handler);
    }
  }

  /**
   * Register a legacy handler for multiple command types
   * @deprecated Use register(handler: ICommandHandler) instead
   *
   * @param types - Array of command types this handler processes
   * @param handler - The handler to register
   */
  registerForTypes(types: CommandType[], handler: LegacyCommandHandler): void {
    for (const type of types) {
      this.registerLegacy(type, handler);
    }
  }

  /**
   * Execute a command by routing it to the appropriate handler (legacy API)
   * @deprecated Use route(command: ParsedCommand) instead
   *
   * @param command - The parsed command to execute
   * @param context - The handler context containing plugin and settings
   */
  async execute(command: ParsedCommand, context: HandlerContext): Promise<void> {
    // Store context for legacy handlers
    this.legacyContext = context;

    // Try new interface handlers first
    const handlers = this.handlers.get(command.type) || [];
    const handler = handlers.find((h) => h.canHandle(command));

    if (handler) {
      try {
        await handler.handle(command);
      } catch (error) {
        console.error(`[Vimrc] Error executing command:`, error);
        throw error; // Legacy API throws errors
      }
      return;
    }

    // Fall back to legacy handlers
    const legacyHandlers = this.legacyHandlers.get(command.type) || [];
    const legacyHandler = legacyHandlers.find((h) => h.canHandle(command));

    if (!legacyHandler) {
      console.warn(`[Vimrc] No handler found for command type: ${command.type}`);
      return;
    }

    try {
      await legacyHandler.handle(command, context);
    } catch (error) {
      console.error(`[Vimrc] Error executing command:`, error);
      throw error; // Legacy API throws errors
    }
  }

  /**
   * Check if a handler is registered for a command type
   *
   * @param type - The command type to check
   * @returns true if a handler is registered for this type
   */
  hasHandler(type: CommandType): boolean {
    const newHandlers = this.handlers.get(type);
    const legacyHandlers = this.legacyHandlers.get(type);
    return (
      (newHandlers !== undefined && newHandlers.length > 0) ||
      (legacyHandlers !== undefined && legacyHandlers.length > 0)
    );
  }

  /**
   * Get handlers for a specific command type (legacy handlers)
   *
   * @param type - The command type
   * @returns Array of handlers for this type
   */
  getHandlersForType(type: CommandType): LegacyCommandHandler[] {
    return this.legacyHandlers.get(type) || [];
  }

  /**
   * Get all unique registered handlers (includes both new and legacy)
   *
   * @returns Array of all unique handlers
   */
  getAllHandlers(): (ICommandHandler | LegacyCommandHandler)[] {
    return [...this.allHandlers, ...this.allLegacyHandlers];
  }

  /**
   * Get count of registered command types
   *
   * @returns Number of command types with registered handlers
   */
  getRegisteredTypeCount(): number {
    const types = new Set([
      ...this.handlers.keys(),
      ...this.legacyHandlers.keys(),
    ]);
    return types.size;
  }

  /**
   * Clear all handlers and call cleanup on each
   * @deprecated Use cleanup() instead
   */
  clear(): void {
    this.cleanup();
  }

  // ============================================
  // Private methods
  // ============================================

  /**
   * Emit an error event through the EventBus
   * If no EventBus is configured, logs to console
   *
   * @param error - The error to emit
   * @param context - Context information about where the error occurred
   */
  private emitError(error: Error, context: string): void {
    if (this.eventBus) {
      this.eventBus.emit(EventType.ERROR_OCCURRED, {
        error,
        context,
        severity: 'error',
      });
    } else {
      console.error(`[Vimrc] ${context}:`, error);
    }
  }
}

/**
 * Mapping command types that KeyMapper handles
 */
export const MAPPING_COMMAND_TYPES: CommandType[] = [
  'map' as CommandType,
  'nmap' as CommandType,
  'imap' as CommandType,
  'vmap' as CommandType,
  'noremap' as CommandType,
  'nnoremap' as CommandType,
  'inoremap' as CommandType,
  'vnoremap' as CommandType,
  // unmap commands
  'unmap' as CommandType,
  'nunmap' as CommandType,
  'iunmap' as CommandType,
  'vunmap' as CommandType,
];

/**
 * Command types that CommandExecutor handles
 */
export const EXECUTOR_COMMAND_TYPES: CommandType[] = [
  'obcommand' as CommandType,
  'exmap' as CommandType,
  // obmap commands - direct mapping to Obsidian commands
  'obmap' as CommandType,
  'nobmap' as CommandType,
  'iobmap' as CommandType,
  'vobmap' as CommandType,
  // amap commands - mapping to async actions
  'amap' as CommandType,
];

/**
 * Create and configure a CommandRegistry with KeyMapper and CommandExecutor
 *
 * @param keyMapper - The KeyMapper instance to register
 * @param commandExecutor - The CommandExecutor instance to register
 * @param eventBus - Optional EventBus for error event emission
 * @returns Configured CommandRegistry
 */
export function createConfiguredRegistry(
  keyMapper: LegacyCommandHandler,
  commandExecutor: LegacyCommandHandler,
  eventBus?: IEventBus
): CommandRegistry {
  const registry = new CommandRegistry(eventBus);

  // Register KeyMapper for all mapping command types
  registry.registerForTypes(MAPPING_COMMAND_TYPES, keyMapper);

  // Register CommandExecutor for obcommand and exmap
  registry.registerForTypes(EXECUTOR_COMMAND_TYPES, commandExecutor);

  return registry;
}
