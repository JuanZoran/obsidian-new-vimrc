/**
 * VimAdapter - CodeMirror Vim API Adapter Layer
 *
 * Provides a clean interface for all CodeMirror Vim API interactions.
 * Handles operation queuing when the API is unavailable and provides
 * typed interfaces for motion, action, operator, and ex command registration.
 *
 * @module services/VimAdapter
 *
 * Requirements:
 * - 2.1: Handle all CodeMirror Vim API calls for key mappings
 * - 2.2: Provide clean interface for motion registration
 * - 2.3: Provide clean interface for action registration
 * - 2.4: Provide clean interface for ex command registration
 * - 2.5: Queue operations when API unavailable and retry when available
 * - 2.6: Expose typed interface matching CodeMirror Vim capabilities
 */

import type {
  IVimAdapter,
  IEventBus,
  MotionCallback,
  ActionCallback,
  OperatorCallback,
  ExCallback,
} from '../types/services';
import type { VimMode } from '../types/mappings';
import { EventType } from '../types/events';
import { getLogger } from './Logger';

const log = getLogger('vimAdapter');

/**
 * CodeMirror Vim API interface
 */
interface VimApi {
  defineEx: (name: string, prefix: string, callback: ExCallback) => void;
  defineAction: (name: string, callback: ActionCallback) => void;
  defineMotion: (name: string, callback: MotionCallback) => void;
  defineOperator: (name: string, callback: OperatorCallback) => void;
  mapCommand: (
    keys: string,
    type: string,
    name: string,
    args?: unknown,
    extra?: { context?: string }
  ) => void;
  map: (lhs: string, rhs: string, mode?: string) => void;
  noremap: (lhs: string, rhs: string, mode?: string) => void;
  unmap: (lhs: string, mode?: string) => void;
  mapclear: (mode?: string) => void;
}

/**
 * Operation types for queuing
 */
type OperationType =
  | 'map'
  | 'noremap'
  | 'unmap'
  | 'mapclear'
  | 'defineMotion'
  | 'defineAction'
  | 'defineOperator'
  | 'defineEx'
  | 'mapCommand';

/**
 * Queued operation structure
 */
interface QueuedOperation {
  type: OperationType;
  args: unknown[];
  timestamp: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_INTERVAL = 100;
const DEFAULT_MAX_RETRIES = 50;
const DEFAULT_READY_TIMEOUT = 5000;

/**
 * VimAdapter implementation
 *
 * Wraps the CodeMirror Vim API and provides:
 * - Type-safe interface for all Vim operations
 * - Operation queuing when API is unavailable
 * - Automatic retry mechanism
 * - Event emission for API state changes
 */
export class VimAdapter implements IVimAdapter {
  private eventBus: IEventBus | null;
  private operationQueue: QueuedOperation[] = [];
  private isProcessingQueue = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private retryInterval: number;
  private maxRetries: number;
  private readyTimeout: number;

  /**
   * Create a new VimAdapter
   *
   * @param eventBus - Optional EventBus for emitting state change events
   * @param options - Configuration options
   */
  constructor(
    eventBus?: IEventBus,
    options?: {
      retryInterval?: number;
      maxRetries?: number;
      readyTimeout?: number;
    }
  ) {
    this.eventBus = eventBus ?? null;
    this.retryInterval = options?.retryInterval ?? DEFAULT_RETRY_INTERVAL;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.readyTimeout = options?.readyTimeout ?? DEFAULT_READY_TIMEOUT;
  }

  /**
   * Get the CodeMirror Vim API from the global window object
   */
  private getVimApi(): VimApi | null {
    // Try to get Vim API from window.CodeMirrorAdapter.Vim
    const vimApi = (window as unknown as { CodeMirrorAdapter?: { Vim?: VimApi } })
      ?.CodeMirrorAdapter?.Vim;
    return vimApi ?? null;
  }

  /**
   * Check if the Vim API is currently available
   *
   * @returns true if the API is available and ready to use
   */
  isAvailable(): boolean {
    return this.getVimApi() !== null;
  }

  /**
   * Wait for the Vim API to become ready
   *
   * @returns Promise that resolves when the API is available
   * @throws Error if the API doesn't become available within the timeout
   */
  waitForReady(): Promise<void> {
    // If already available, resolve immediately
    if (this.isAvailable()) {
      this.emitReady();
      return Promise.resolve();
    }

    // If already waiting, return existing promise
    if (this.readyPromise) {
      return this.readyPromise;
    }

    // Create new promise for waiting
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;

      let attempts = 0;
      const maxAttempts = Math.ceil(this.readyTimeout / this.retryInterval);

      const checkReady = () => {
        attempts++;

        if (this.isAvailable()) {
          this.emitReady();
          this.readyPromise = null;
          this.readyResolve = null;
          resolve();
          return;
        }

        if (attempts >= maxAttempts) {
          this.emitUnavailable('Timeout waiting for Vim API');
          this.readyPromise = null;
          this.readyResolve = null;
          reject(new Error('Timeout waiting for Vim API to become available'));
          return;
        }

        setTimeout(checkReady, this.retryInterval);
      };

      // Start checking
      setTimeout(checkReady, this.retryInterval);
    });

    return this.readyPromise;
  }

  /**
   * Emit VIM_READY event
   */
  private emitReady(): void {
    if (this.eventBus) {
      this.eventBus.emit(EventType.VIM_READY, {});
    }
  }

  /**
   * Emit VIM_UNAVAILABLE event
   */
  private emitUnavailable(reason: string): void {
    if (this.eventBus) {
      this.eventBus.emit(EventType.VIM_UNAVAILABLE, { reason });
    }
  }

  /**
   * Queue an operation for later execution
   */
  private queueOperation(type: OperationType, args: unknown[]): void {
    this.operationQueue.push({
      type,
      args,
      timestamp: Date.now(),
    });

    // Start processing queue if not already doing so
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Process queued operations when API becomes available
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;
    let retries = 0;

    while (this.operationQueue.length > 0 && retries < this.maxRetries) {
      if (!this.isAvailable()) {
        retries++;
        await this.delay(this.retryInterval);
        continue;
      }

      // Reset retries when API becomes available
      retries = 0;

      // Process all queued operations
      while (this.operationQueue.length > 0 && this.isAvailable()) {
        const operation = this.operationQueue.shift()!;
        this.executeOperation(operation);
      }
    }

    // If we exhausted retries, emit unavailable event
    if (retries >= this.maxRetries && this.operationQueue.length > 0) {
      this.emitUnavailable('Max retries exceeded while processing queue');
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute a single queued operation
   */
  private executeOperation(operation: QueuedOperation): void {
    const vimApi = this.getVimApi();
    if (!vimApi) {
      // Re-queue if API became unavailable
      this.operationQueue.unshift(operation);
      return;
    }

    try {
      switch (operation.type) {
        case 'map':
          vimApi.map(
            operation.args[0] as string,
            operation.args[1] as string,
            operation.args[2] as string | undefined
          );
          break;
        case 'noremap':
          vimApi.noremap(
            operation.args[0] as string,
            operation.args[1] as string,
            operation.args[2] as string | undefined
          );
          break;
        case 'unmap':
          vimApi.unmap(
            operation.args[0] as string,
            operation.args[1] as string | undefined
          );
          break;
        case 'mapclear':
          vimApi.mapclear(operation.args[0] as string | undefined);
          break;
        case 'defineMotion':
          vimApi.defineMotion(
            operation.args[0] as string,
            operation.args[1] as MotionCallback
          );
          break;
        case 'defineAction':
          vimApi.defineAction(
            operation.args[0] as string,
            operation.args[1] as ActionCallback
          );
          break;
        case 'defineOperator':
          vimApi.defineOperator(
            operation.args[0] as string,
            operation.args[1] as OperatorCallback
          );
          break;
        case 'defineEx':
          vimApi.defineEx(
            operation.args[0] as string,
            operation.args[1] as string,
            operation.args[2] as ExCallback
          );
          break;
        case 'mapCommand':
          vimApi.mapCommand(
            operation.args[0] as string,
            operation.args[1] as string,
            operation.args[2] as string,
            operation.args[3],
            operation.args[4] as { context?: string } | undefined
          );
          break;
      }
    } catch (error) {
      log.error(`Failed to execute ${operation.type}:`, error);
    }
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convert VimMode to string for CodeMirror API
   */
  private modeToString(mode?: VimMode): string | undefined {
    if (!mode) return undefined;

    switch (mode) {
      case 'normal':
        return 'normal';
      case 'insert':
        return 'insert';
      case 'visual':
        return 'visual';
      case 'all':
        return undefined; // undefined means all modes in CodeMirror
      default:
        return undefined;
    }
  }

  // ==========================================
  // Mapping Methods (Requirements 2.1, 2.6)
  // ==========================================

  /**
   * Create a recursive mapping
   *
   * @param lhs - Left-hand side (key sequence to map from)
   * @param rhs - Right-hand side (key sequence to map to)
   * @param mode - Optional Vim mode (normal, insert, visual, all)
   */
  map(lhs: string, rhs: string, mode?: VimMode): void {
    const modeStr = this.modeToString(mode);
    const vimApi = this.getVimApi();

    log.debug(`map: ${lhs} -> ${rhs} (${modeStr ?? 'all'})`);

    if (vimApi) {
      try {
        vimApi.map(lhs, rhs, modeStr);
      } catch (error) {
        log.error(`Failed to map ${lhs}:`, error);
      }
    } else {
      log.debug(`Queuing map operation: ${lhs}`);
      // Queue for later execution (Requirement 2.5)
      this.queueOperation('map', [lhs, rhs, modeStr]);
    }
  }

  /**
   * Create a non-recursive mapping
   *
   * @param lhs - Left-hand side (key sequence to map from)
   * @param rhs - Right-hand side (key sequence to map to)
   * @param mode - Optional Vim mode (normal, insert, visual, all)
   */
  noremap(lhs: string, rhs: string, mode?: VimMode): void {
    const modeStr = this.modeToString(mode);
    const vimApi = this.getVimApi();

    log.debug(`noremap: ${lhs} -> ${rhs} (${modeStr ?? 'all'})`);

    if (vimApi) {
      try {
        vimApi.noremap(lhs, rhs, modeStr);
      } catch (error) {
        log.error(`Failed to noremap ${lhs}:`, error);
      }
    } else {
      log.debug(`Queuing noremap operation: ${lhs}`);
      this.queueOperation('noremap', [lhs, rhs, modeStr]);
    }
  }

  /**
   * Remove a mapping
   *
   * @param lhs - Left-hand side (key sequence to unmap)
   * @param mode - Optional Vim mode
   */
  unmap(lhs: string, mode?: VimMode): void {
    const modeStr = this.modeToString(mode);
    const vimApi = this.getVimApi();

    log.debug(`unmap: ${lhs} (${modeStr ?? 'all'})`);

    if (vimApi) {
      try {
        vimApi.unmap(lhs, modeStr);
      } catch (error) {
        log.error(`Failed to unmap ${lhs}:`, error);
      }
    } else {
      this.queueOperation('unmap', [lhs, modeStr]);
    }
  }

  /**
   * Clear all mappings for a mode
   *
   * @param mode - Optional Vim mode (clears all modes if not specified)
   */
  mapclear(mode?: VimMode): void {
    const modeStr = this.modeToString(mode);
    const vimApi = this.getVimApi();

    log.debug(`mapclear (${modeStr ?? 'all'})`);

    if (vimApi) {
      try {
        vimApi.mapclear(modeStr);
      } catch (error) {
        log.error('Failed to mapclear:', error);
      }
    } else {
      this.queueOperation('mapclear', [modeStr]);
    }
  }

  // ==========================================
  // Custom Command Methods (Requirements 2.2, 2.3, 2.4)
  // ==========================================

  /**
   * Define a custom motion (Requirement 2.2)
   *
   * Motions are used with operators (d, c, y, etc.) to define
   * the range of text to operate on.
   *
   * @param name - Unique name for the motion
   * @param callback - Function that calculates the new cursor position
   */
  defineMotion(name: string, callback: MotionCallback): void {
    const vimApi = this.getVimApi();

    log.debug(`defineMotion: ${name}`);

    if (vimApi) {
      try {
        vimApi.defineMotion(name, callback);
      } catch (error) {
        log.error(`Failed to define motion ${name}:`, error);
      }
    } else {
      this.queueOperation('defineMotion', [name, callback]);
    }
  }

  /**
   * Define a custom action (Requirement 2.3)
   *
   * Actions are commands that don't take a motion (like 'u' for undo).
   *
   * @param name - Unique name for the action
   * @param callback - Function to execute when action is triggered
   */
  defineAction(name: string, callback: ActionCallback): void {
    const vimApi = this.getVimApi();

    log.debug(`defineAction: ${name}`);

    if (vimApi) {
      try {
        vimApi.defineAction(name, callback);
      } catch (error) {
        log.error(`Failed to define action ${name}:`, error);
      }
    } else {
      this.queueOperation('defineAction', [name, callback]);
    }
  }

  /**
   * Define a custom operator
   *
   * Operators work with motions to perform operations on text ranges
   * (like 'd' for delete, 'c' for change).
   *
   * @param name - Unique name for the operator
   * @param callback - Function to execute on the selected range
   */
  defineOperator(name: string, callback: OperatorCallback): void {
    const vimApi = this.getVimApi();

    log.debug(`defineOperator: ${name}`);

    if (vimApi) {
      try {
        vimApi.defineOperator(name, callback);
      } catch (error) {
        log.error(`Failed to define operator ${name}:`, error);
      }
    } else {
      this.queueOperation('defineOperator', [name, callback]);
    }
  }

  /**
   * Define an ex command (Requirement 2.4)
   *
   * Ex commands are executed from the command line (e.g., :write, :quit).
   *
   * @param name - Full name of the ex command
   * @param prefix - Short prefix for the command (can be same as name)
   * @param callback - Function to execute when command is called
   */
  defineEx(name: string, prefix: string, callback: ExCallback): void {
    const vimApi = this.getVimApi();

    log.debug(`defineEx: :${name} (prefix: ${prefix})`);

    if (vimApi) {
      try {
        vimApi.defineEx(name, prefix, callback);
      } catch (error) {
        log.error(`Failed to define ex command ${name}:`, error);
      }
    } else {
      this.queueOperation('defineEx', [name, prefix, callback]);
    }
  }

  /**
   * Map keys to a command
   *
   * This is a lower-level method that maps key sequences directly
   * to named commands (motions, actions, operators).
   *
   * @param keys - Key sequence to map
   * @param type - Command type ('motion', 'action', 'operator')
   * @param name - Name of the command to execute
   * @param args - Optional arguments to pass to the command
   * @param extra - Optional extra configuration (e.g., context for mode)
   */
  mapCommand(
    keys: string,
    type: string,
    name: string,
    args?: unknown,
    extra?: { context?: string }
  ): void {
    const vimApi = this.getVimApi();

    log.debug(`mapCommand: ${keys} -> ${type}:${name} (${extra?.context ?? 'all'})`);

    if (vimApi) {
      try {
        vimApi.mapCommand(keys, type, name, args, extra);
      } catch (error) {
        log.error(`Failed to map command ${keys}:`, error);
      }
    } else {
      this.queueOperation('mapCommand', [keys, type, name, args, extra]);
    }
  }

  // ==========================================
  // Queue Management
  // ==========================================

  /**
   * Get the number of queued operations
   *
   * @returns Number of operations waiting to be executed
   */
  getQueueLength(): number {
    return this.operationQueue.length;
  }

  /**
   * Clear all queued operations
   *
   * Use this when you want to discard pending operations
   * (e.g., during plugin unload).
   */
  clearQueue(): void {
    this.operationQueue = [];
  }

  /**
   * Cleanup resources
   *
   * Should be called when the adapter is no longer needed.
   */
  cleanup(): void {
    this.clearQueue();
    this.readyPromise = null;
    this.readyResolve = null;
  }
}
