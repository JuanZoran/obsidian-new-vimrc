/**
 * Service container and dependency injection type definitions
 */

import type { EventType, EventPayload, EventHandler, Unsubscribe } from './events';
import type { VimrcSettings, IConfigManager } from './settings';
import type { IMappingStore, IMappingApplier, VimMode, KeyMapping } from './mappings';
import type { ICommandRegistry, ICommandHandler, ParsedCommand, ParseResult, IObmapProvider, IExmapProvider } from './commands';

/**
 * Service token type - a branded symbol for type-safe dependency injection
 */
export type ServiceToken<T> = symbol & { __type?: T };

/**
 * Service factory function type
 */
export type ServiceFactory<T> = (container: IServiceContainer) => T;

/**
 * Service container interface
 */
export interface IServiceContainer {
  /**
   * Register a transient service (new instance each time)
   */
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;

  /**
   * Register a singleton service (same instance each time)
   */
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;

  /**
   * Register an existing instance as a singleton
   */
  registerInstance<T>(token: ServiceToken<T>, instance: T): void;

  /**
   * Resolve a service by its token
   */
  resolve<T>(token: ServiceToken<T>): T;

  /**
   * Check if a service is registered
   */
  has<T>(token: ServiceToken<T>): boolean;

  /**
   * Dispose all services and clear registrations
   */
  dispose(): void;
}

/**
 * EventBus interface
 */
export interface IEventBus {
  /**
   * Emit an event synchronously
   */
  emit<T extends EventType>(type: T, payload: EventPayload<T>): void;

  /**
   * Emit an event and wait for all async handlers
   */
  emitAsync<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void>;

  /**
   * Subscribe to an event
   */
  on<T extends EventType>(type: T, handler: EventHandler<T>): Unsubscribe;

  /**
   * Subscribe to an event for one-time handling
   */
  once<T extends EventType>(type: T, handler: EventHandler<T>): Unsubscribe;

  /**
   * Unsubscribe a specific handler
   */
  off<T extends EventType>(type: T, handler: EventHandler<T>): void;

  /**
   * Clear all subscriptions
   */
  clear(): void;
}

/**
 * Vim adapter callback types
 */
export type MotionCallback = (cm: unknown, head: unknown, motionArgs: unknown) => unknown;
export type ActionCallback = (cm: unknown, actionArgs: unknown) => void;
export type OperatorCallback = (cm: unknown, operatorArgs: unknown, ranges: unknown) => void;
export type ExCallback = (cm: unknown, params: unknown) => void;

/**
 * Vim adapter interface
 */
export interface IVimAdapter {
  /**
   * Check if Vim API is available
   */
  isAvailable(): boolean;

  /**
   * Wait for Vim API to become ready
   */
  waitForReady(): Promise<void>;

  /**
   * Create a recursive mapping
   */
  map(lhs: string, rhs: string, mode?: VimMode): void;

  /**
   * Create a non-recursive mapping
   */
  noremap(lhs: string, rhs: string, mode?: VimMode): void;

  /**
   * Remove a mapping
   */
  unmap(lhs: string, mode?: VimMode): void;

  /**
   * Clear all mappings for a mode
   */
  mapclear(mode?: VimMode): void;

  /**
   * Define a custom motion
   */
  defineMotion(name: string, callback: MotionCallback): void;

  /**
   * Define a custom action
   */
  defineAction(name: string, callback: ActionCallback): void;

  /**
   * Define a custom operator
   */
  defineOperator(name: string, callback: OperatorCallback): void;

  /**
   * Define an ex command
   */
  defineEx(name: string, prefix: string, callback: ExCallback): void;

  /**
   * Map keys to a command
   */
  mapCommand(keys: string, type: string, name: string, args?: unknown, extra?: unknown): void;
}

/**
 * File watcher interface
 */
export interface IFileWatcher {
  /**
   * Start watching a file path
   */
  watch(path: string): void;

  /**
   * Stop watching a file path
   */
  unwatch(path: string): void;

  /**
   * Stop watching all paths
   */
  unwatchAll(): void;

  /**
   * Set debounce delay for file change events
   */
  setDebounceDelay(ms: number): void;
}

/**
 * Load result from vimrc processing
 */
export interface LoadResult {
  success: boolean;
  path: string | null;
  mappingCount: number;
  errors: Array<{ lineNumber: number; message: string; raw: string }>;
  warnings: Array<{ lineNumber: number; message: string; raw: string }>;
}

/**
 * Vimrc loader interface
 */
export interface IVimrcLoader {
  /**
   * Load and process the vimrc file
   */
  load(): Promise<LoadResult>;

  /**
   * Reload the vimrc file
   */
  reload(): Promise<LoadResult>;

  /**
   * Get the last load result
   */
  getLastResult(): LoadResult | null;
}

/**
 * Vimrc parser interface
 */
export interface IVimrcParser {
  /**
   * Parse vimrc content
   */
  parse(content: string): ParseResult;
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Error categories
 */
export enum ErrorCategory {
  PARSE = 'parse',
  VALIDATION = 'validation',
  EXECUTION = 'execution',
  FILE = 'file',
  VIM_API = 'vim_api',
  INTERNAL = 'internal',
}

/**
 * Categorized error
 */
export interface CategorizedError {
  error: Error;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: string;
  code?: string;
  recoverable: boolean;
}

/**
 * Error handler interface
 */
export interface IErrorHandler {
  /**
   * Handle an error
   */
  handle(error: Error, context: string): void;

  /**
   * Handle an error with category
   */
  handleCategorized(error: CategorizedError): void;

  /**
   * Aggregate multiple errors
   */
  aggregate(errors: CategorizedError[]): void;

  /**
   * Get recent errors
   */
  getRecentErrors(): CategorizedError[];

  /**
   * Clear error history
   */
  clearHistory(): void;
}

/**
 * Service tokens for dependency injection
 */
export const ServiceTokens = {
  EventBus: Symbol('EventBus') as ServiceToken<IEventBus>,
  ConfigManager: Symbol('ConfigManager') as ServiceToken<IConfigManager>,
  ErrorHandler: Symbol('ErrorHandler') as ServiceToken<IErrorHandler>,
  VimAdapter: Symbol('VimAdapter') as ServiceToken<IVimAdapter>,
  FileWatcher: Symbol('FileWatcher') as ServiceToken<IFileWatcher>,
  VimrcLoader: Symbol('VimrcLoader') as ServiceToken<IVimrcLoader>,
  VimrcParser: Symbol('VimrcParser') as ServiceToken<IVimrcParser>,
  MappingStore: Symbol('MappingStore') as ServiceToken<IMappingStore>,
  MappingApplier: Symbol('MappingApplier') as ServiceToken<IMappingApplier>,
  CommandRegistry: Symbol('CommandRegistry') as ServiceToken<ICommandRegistry>,
  ObmapProvider: Symbol('ObmapProvider') as ServiceToken<IObmapProvider>,
  ExmapProvider: Symbol('ExmapProvider') as ServiceToken<IExmapProvider>,
} as const;
