/**
 * Logger - Centralized Debug Logging Service
 *
 * Provides module-aware logging with configurable debug levels.
 * Integrates with plugin settings for runtime control.
 *
 * @module services/Logger
 */

import type { DebugModule, DebugSettings } from '../types/settings';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Plugin name prefix */
  prefix: string;
  /** Function to get current debug settings */
  getDebugSettings: () => DebugSettings;
}

/**
 * Singleton Logger instance
 */
let loggerInstance: Logger | null = null;

/**
 * Logger class for centralized debug logging
 */
export class Logger {
  private prefix: string;
  private getDebugSettings: () => DebugSettings;

  private constructor(config: LoggerConfig) {
    this.prefix = config.prefix;
    this.getDebugSettings = config.getDebugSettings;
  }

  /**
   * Initialize the logger singleton
   */
  static initialize(config: LoggerConfig): Logger {
    loggerInstance = new Logger(config);
    return loggerInstance;
  }

  /**
   * Get the logger instance
   */
  static getInstance(): Logger | null {
    return loggerInstance;
  }

  /**
   * Create a module-specific logger
   */
  static forModule(module: DebugModule): ModuleLogger {
    return new ModuleLogger(module);
  }

  /**
   * Check if debug is enabled for a module
   */
  isEnabled(module: DebugModule): boolean {
    const settings = this.getDebugSettings();
    return settings.enabled && settings.modules[module];
  }

  /**
   * Log a debug message
   */
  debug(module: DebugModule, message: string, ...args: unknown[]): void {
    if (this.isEnabled(module)) {
      console.log(`[${this.prefix}:${module}]`, message, ...args);
    }
  }

  /**
   * Log an info message (always shown when debug enabled)
   */
  info(module: DebugModule, message: string, ...args: unknown[]): void {
    if (this.isEnabled(module)) {
      console.info(`[${this.prefix}:${module}]`, message, ...args);
    }
  }

  /**
   * Log a warning (always shown)
   */
  warn(module: DebugModule, message: string, ...args: unknown[]): void {
    console.warn(`[${this.prefix}:${module}]`, message, ...args);
  }

  /**
   * Log an error (always shown)
   */
  error(module: DebugModule, message: string, ...args: unknown[]): void {
    console.error(`[${this.prefix}:${module}]`, message, ...args);
  }

  /**
   * Log with timing information
   */
  time(module: DebugModule, label: string): () => void {
    if (!this.isEnabled(module)) {
      return () => {};
    }
    const start = performance.now();
    const fullLabel = `[${this.prefix}:${module}] ${label}`;
    return () => {
      const duration = (performance.now() - start).toFixed(2);
      console.log(`${fullLabel} completed in ${duration}ms`);
    };
  }

  /**
   * Log a group of related messages
   */
  group(module: DebugModule, label: string, fn: () => void): void {
    if (!this.isEnabled(module)) {
      fn();
      return;
    }
    console.group(`[${this.prefix}:${module}] ${label}`);
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Log a table (for structured data)
   */
  table(module: DebugModule, data: unknown[], columns?: string[]): void {
    if (this.isEnabled(module)) {
      console.table(data, columns);
    }
  }
}

/**
 * Module-specific logger wrapper
 */
export class ModuleLogger {
  private module: DebugModule;

  constructor(module: DebugModule) {
    this.module = module;
  }

  private get logger(): Logger | null {
    return Logger.getInstance();
  }

  isEnabled(): boolean {
    return this.logger?.isEnabled(this.module) ?? false;
  }

  debug(message: string, ...args: unknown[]): void {
    this.logger?.debug(this.module, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.logger?.info(this.module, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.logger) {
      this.logger.warn(this.module, message, ...args);
    } else {
      // Fallback when Logger not initialized
      console.warn(`[Vimrc:${this.module}]`, message, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.logger) {
      this.logger.error(this.module, message, ...args);
    } else {
      // Fallback when Logger not initialized
      console.error(`[Vimrc:${this.module}]`, message, ...args);
    }
  }

  time(label: string): () => void {
    return this.logger?.time(this.module, label) ?? (() => {});
  }

  group(label: string, fn: () => void): void {
    this.logger?.group(this.module, label, fn) ?? fn();
  }

  table(data: unknown[], columns?: string[]): void {
    this.logger?.table(this.module, data, columns);
  }
}

/**
 * Convenience function to get a module logger
 */
export function getLogger(module: DebugModule): ModuleLogger {
  return Logger.forModule(module);
}
