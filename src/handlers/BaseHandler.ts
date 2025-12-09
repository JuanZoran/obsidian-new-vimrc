/**
 * BaseHandler - Abstract Base Class for Command Handlers
 *
 * Provides common functionality for all command handlers:
 * - Type-safe command type support declaration
 * - Default canHandle implementation based on supportedTypes
 * - Abstract handle method for subclass implementation
 * - Cleanup lifecycle method
 *
 * @module handlers/BaseHandler
 *
 * Requirements:
 * - 5.1: New command types only require new CommandHandler implementation
 * - 5.4: CommandHandler interface defines canHandle, handle, and cleanup methods
 */

import type { IEventBus, IErrorHandler } from '../types/services';
import type { ICommandHandler, ParsedCommand, CommandType } from '../types/commands';

/**
 * Dependencies that can be injected into handlers
 */
export interface HandlerDependencies {
  eventBus: IEventBus;
  errorHandler?: IErrorHandler;
}

/**
 * Abstract base class for command handlers
 *
 * Provides common functionality and enforces the ICommandHandler interface.
 * Subclasses must implement:
 * - supportedTypes: Array of CommandType values this handler processes
 * - handle: The actual command processing logic
 *
 * Optionally override:
 * - canHandle: For custom command filtering beyond type matching
 * - cleanup: For resource cleanup when handler is disposed
 */
export abstract class BaseHandler implements ICommandHandler {
  /**
   * EventBus for emitting events
   */
  protected eventBus: IEventBus;

  /**
   * Optional error handler for error reporting
   */
  protected errorHandler?: IErrorHandler;

  /**
   * Create a new handler with dependencies
   *
   * @param deps - Handler dependencies (eventBus, errorHandler)
   */
  constructor(deps: HandlerDependencies) {
    this.eventBus = deps.eventBus;
    this.errorHandler = deps.errorHandler;
  }

  /**
   * Command types this handler supports
   * Must be implemented by subclasses
   */
  abstract readonly supportedTypes: CommandType[];

  /**
   * Check if this handler can process the given command
   *
   * Default implementation checks if command.type is in supportedTypes.
   * Override for more complex filtering logic.
   *
   * @param command - The parsed command to check
   * @returns true if this handler can process the command
   */
  canHandle(command: ParsedCommand): boolean {
    return this.supportedTypes.includes(command.type);
  }

  /**
   * Process the command
   * Must be implemented by subclasses
   *
   * @param command - The parsed command to process
   */
  abstract handle(command: ParsedCommand): Promise<void>;

  /**
   * Cleanup resources when handler is disposed
   *
   * Override in subclasses that need to release resources.
   * Default implementation does nothing.
   */
  cleanup(): void {
    // Default: no cleanup needed
  }

  /**
   * Log a debug message if debug mode is enabled
   *
   * @param message - The message to log
   * @param args - Additional arguments to log
   */
  protected debug(message: string, ...args: unknown[]): void {
    console.log(`[Vimrc] ${message}`, ...args);
  }

  /**
   * Log a warning message
   *
   * @param message - The warning message
   * @param args - Additional arguments to log
   */
  protected warn(message: string, ...args: unknown[]): void {
    console.warn(`[Vimrc] ${message}`, ...args);
  }

  /**
   * Log an error message
   *
   * @param message - The error message
   * @param error - The error object
   */
  protected error(message: string, error?: Error): void {
    console.error(`[Vimrc] ${message}`, error);
  }
}
