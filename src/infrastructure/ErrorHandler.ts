/**
 * ErrorHandler - Enhanced Error Handling with Recovery Strategies
 *
 * Provides comprehensive error handling with:
 * - Error categorization by severity and type (Requirement 9.1)
 * - Automatic recovery strategies (Requirement 9.2)
 * - Context information in error logs (Requirement 9.3)
 * - Error aggregation for batch operations (Requirement 9.4)
 * - Error events through EventBus (Requirement 9.5)
 *
 * @module infrastructure/ErrorHandler
 */

import type { IEventBus, IErrorHandler, CategorizedError } from '../types/services';
import { ErrorSeverity, ErrorCategory } from '../types/services';
import { EventType } from '../types/events';

/**
 * Recovery result from a recovery strategy
 */
export interface RecoveryResult {
  success: boolean;
  retryable?: boolean;
  silent?: boolean;
  message?: string;
}

/**
 * Recovery strategy interface
 */
export interface RecoveryStrategy {
  /**
   * Check if this strategy can recover from the given error
   */
  canRecover(error: CategorizedError): boolean;

  /**
   * Attempt to recover from the error
   */
  recover(error: CategorizedError): Promise<RecoveryResult>;
}

/**
 * Aggregated error report for batch operations
 */
export interface AggregatedError {
  summary: string;
  count: number;
  errors: CategorizedError[];
  firstOccurrence: number;
  lastOccurrence: number;
  categories: Map<ErrorCategory, number>;
  severities: Map<ErrorSeverity, number>;
}

/**
 * Default recovery strategies
 */
const defaultRecoveryStrategies: RecoveryStrategy[] = [
  // Vim API unavailable - retry after delay
  {
    canRecover: (e) =>
      e.category === ErrorCategory.VIM_API && e.code === 'API_UNAVAILABLE',
    recover: async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { success: true, retryable: true };
    },
  },
  // File not found - silent handling
  {
    canRecover: (e) =>
      e.category === ErrorCategory.FILE &&
      (e.code === 'ENOENT' || e.error.message.includes('not found')),
    recover: async () => ({ success: true, silent: true }),
  },
  // Parse errors - not recoverable but provide context
  {
    canRecover: (e) => e.category === ErrorCategory.PARSE,
    recover: async () => ({
      success: false,
      message: 'Parse errors require manual correction',
    }),
  },
];

/**
 * Maximum number of errors to keep in history
 */
const MAX_ERROR_HISTORY = 100;

/**
 * ErrorHandler implementation
 *
 * Manages error handling with categorization, recovery, and event emission.
 */
export class ErrorHandler implements IErrorHandler {
  /**
   * EventBus for emitting error events
   */
  private eventBus: IEventBus;

  /**
   * Error history for recent errors
   */
  private errorHistory: CategorizedError[];

  /**
   * Recovery strategies
   */
  private recoveryStrategies: RecoveryStrategy[];

  /**
   * Current aggregation context (for batch operations)
   */
  private aggregationContext: AggregatedError | null;

  /**
   * Create a new ErrorHandler
   *
   * @param eventBus - EventBus for emitting error events
   * @param customStrategies - Optional custom recovery strategies
   */
  constructor(eventBus: IEventBus, customStrategies?: RecoveryStrategy[]) {
    this.eventBus = eventBus;
    this.errorHistory = [];
    this.recoveryStrategies = customStrategies || [...defaultRecoveryStrategies];
    this.aggregationContext = null;
  }

  /**
   * Handle an error with automatic categorization
   *
   * @param error - The error to handle
   * @param context - Context information about where the error occurred
   */
  handle(error: Error, context: string): void {
    const categorized = this.categorizeError(error, context);
    this.handleCategorized(categorized);
  }

  /**
   * Handle a pre-categorized error
   *
   * @param error - The categorized error to handle
   */
  handleCategorized(error: CategorizedError): void {
    // Add to history
    this.addToHistory(error);

    // Add to aggregation if active
    if (this.aggregationContext) {
      this.addToAggregation(error);
    }

    // Emit error event (Requirement 9.5)
    this.eventBus.emit(EventType.ERROR_OCCURRED, {
      error: error.error,
      context: error.context,
      severity: error.severity,
    });

    // Attempt recovery if recoverable (Requirement 9.2)
    if (error.recoverable) {
      this.attemptRecovery(error);
    }
  }

  /**
   * Aggregate multiple errors for batch operations (Requirement 9.4)
   *
   * @param errors - Array of categorized errors to aggregate
   */
  aggregate(errors: CategorizedError[]): void {
    if (errors.length === 0) {
      return;
    }

    const now = Date.now();
    const aggregated: AggregatedError = {
      summary: this.generateSummary(errors),
      count: errors.length,
      errors: [...errors],
      firstOccurrence: now,
      lastOccurrence: now,
      categories: new Map(),
      severities: new Map(),
    };

    // Count by category and severity
    for (const error of errors) {
      const catCount = aggregated.categories.get(error.category) || 0;
      aggregated.categories.set(error.category, catCount + 1);

      const sevCount = aggregated.severities.get(error.severity) || 0;
      aggregated.severities.set(error.severity, sevCount + 1);
    }

    // Add all errors to history
    for (const error of errors) {
      this.addToHistory(error);
    }

    // Emit aggregated error event
    this.eventBus.emit(EventType.ERROR_OCCURRED, {
      error: new Error(aggregated.summary),
      context: `Aggregated: ${errors.length} errors`,
      severity: this.getHighestSeverity(errors),
    });
  }

  /**
   * Start aggregation context for batch operations
   */
  startAggregation(): void {
    this.aggregationContext = {
      summary: '',
      count: 0,
      errors: [],
      firstOccurrence: Date.now(),
      lastOccurrence: Date.now(),
      categories: new Map(),
      severities: new Map(),
    };
  }

  /**
   * End aggregation context and return aggregated result
   */
  endAggregation(): AggregatedError | null {
    if (!this.aggregationContext) {
      return null;
    }

    const result = this.aggregationContext;
    result.summary = this.generateSummary(result.errors);
    this.aggregationContext = null;

    return result;
  }

  /**
   * Get recent errors from history
   *
   * @returns Array of recent categorized errors
   */
  getRecentErrors(): CategorizedError[] {
    return [...this.errorHistory];
  }

  /**
   * Get errors filtered by category
   *
   * @param category - The category to filter by
   * @returns Array of errors matching the category
   */
  getErrorsByCategory(category: ErrorCategory): CategorizedError[] {
    return this.errorHistory.filter((e) => e.category === category);
  }

  /**
   * Get errors filtered by severity
   *
   * @param severity - The severity to filter by
   * @returns Array of errors matching the severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): CategorizedError[] {
    return this.errorHistory.filter((e) => e.severity === severity);
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Add a custom recovery strategy
   *
   * @param strategy - The recovery strategy to add
   */
  addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
  }

  /**
   * Create a categorized error from an Error and context
   *
   * @param error - The original error
   * @param context - Context information
   * @returns Categorized error with inferred category and severity
   */
  createCategorizedError(
    error: Error,
    context: string,
    options?: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      code?: string;
      recoverable?: boolean;
    }
  ): CategorizedError {
    const category = options?.category || this.inferCategory(error, context);
    const severity = options?.severity || this.inferSeverity(error, category);
    const recoverable =
      options?.recoverable ?? this.isRecoverable(error, category);

    return {
      error,
      category,
      severity,
      context,
      code: options?.code,
      recoverable,
    };
  }

  /**
   * Categorize an error based on its properties and context
   */
  private categorizeError(error: Error, context: string): CategorizedError {
    const category = this.inferCategory(error, context);
    const severity = this.inferSeverity(error, category);
    const recoverable = this.isRecoverable(error, category);

    return {
      error,
      category,
      severity,
      context,
      code: this.extractErrorCode(error),
      recoverable,
    };
  }

  /**
   * Infer error category from error and context
   */
  private inferCategory(error: Error, context: string): ErrorCategory {
    const message = error.message.toLowerCase();
    const contextLower = context.toLowerCase();

    // Check for parse errors
    if (
      message.includes('parse') ||
      message.includes('syntax') ||
      contextLower.includes('parse')
    ) {
      return ErrorCategory.PARSE;
    }

    // Check for validation errors
    if (
      message.includes('valid') ||
      message.includes('invalid') ||
      contextLower.includes('valid')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Check for file errors
    if (
      message.includes('file') ||
      message.includes('enoent') ||
      message.includes('path') ||
      contextLower.includes('file')
    ) {
      return ErrorCategory.FILE;
    }

    // Check for Vim API errors
    if (
      message.includes('vim') ||
      message.includes('codemirror') ||
      contextLower.includes('vim')
    ) {
      return ErrorCategory.VIM_API;
    }

    // Check for execution errors
    if (
      message.includes('execute') ||
      message.includes('command') ||
      contextLower.includes('execute')
    ) {
      return ErrorCategory.EXECUTION;
    }

    // Default to internal
    return ErrorCategory.INTERNAL;
  }

  /**
   * Infer error severity from error and category
   */
  private inferSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    const message = error.message.toLowerCase();

    // Fatal errors
    if (
      message.includes('fatal') ||
      message.includes('critical') ||
      category === ErrorCategory.INTERNAL
    ) {
      return ErrorSeverity.FATAL;
    }

    // Warnings
    if (
      message.includes('warning') ||
      message.includes('deprecated') ||
      category === ErrorCategory.VALIDATION
    ) {
      return ErrorSeverity.WARNING;
    }

    // Info level for file not found
    if (category === ErrorCategory.FILE && message.includes('not found')) {
      return ErrorSeverity.INFO;
    }

    // Default to error
    return ErrorSeverity.ERROR;
  }

  /**
   * Check if an error is recoverable
   */
  private isRecoverable(error: Error, category: ErrorCategory): boolean {
    // Check if any recovery strategy can handle this
    const tempError: CategorizedError = {
      error,
      category,
      severity: ErrorSeverity.ERROR,
      context: '',
      recoverable: false,
    };

    return this.recoveryStrategies.some((s) => s.canRecover(tempError));
  }

  /**
   * Extract error code from error if available
   */
  private extractErrorCode(error: Error): string | undefined {
    // Check for Node.js style error codes
    if ('code' in error && typeof (error as { code?: string }).code === 'string') {
      return (error as { code: string }).code;
    }

    // Check for custom error codes
    if ('errorCode' in error && typeof (error as { errorCode?: string }).errorCode === 'string') {
      return (error as { errorCode: string }).errorCode;
    }

    return undefined;
  }

  /**
   * Attempt recovery using registered strategies
   */
  private async attemptRecovery(error: CategorizedError): Promise<void> {
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canRecover(error)) {
        try {
          const result = await strategy.recover(error);

          if (result.success) {
            // Emit recovery event
            this.eventBus.emit(EventType.ERROR_RECOVERED, {
              error: error.error,
              context: error.context,
              strategy: strategy.constructor.name || 'anonymous',
            });

            return;
          }
        } catch {
          // Recovery failed, continue to next strategy
        }
      }
    }
  }

  /**
   * Add error to history with size limit
   */
  private addToHistory(error: CategorizedError): void {
    this.errorHistory.push(error);

    // Keep history size manageable
    if (this.errorHistory.length > MAX_ERROR_HISTORY) {
      this.errorHistory.shift();
    }
  }

  /**
   * Add error to current aggregation context
   */
  private addToAggregation(error: CategorizedError): void {
    if (!this.aggregationContext) {
      return;
    }

    this.aggregationContext.errors.push(error);
    this.aggregationContext.count++;
    this.aggregationContext.lastOccurrence = Date.now();

    const catCount = this.aggregationContext.categories.get(error.category) || 0;
    this.aggregationContext.categories.set(error.category, catCount + 1);

    const sevCount = this.aggregationContext.severities.get(error.severity) || 0;
    this.aggregationContext.severities.set(error.severity, sevCount + 1);
  }

  /**
   * Generate summary for aggregated errors
   */
  private generateSummary(errors: CategorizedError[]): string {
    if (errors.length === 0) {
      return 'No errors';
    }

    if (errors.length === 1) {
      return errors[0].error.message;
    }

    const categories = new Map<ErrorCategory, number>();
    for (const error of errors) {
      const count = categories.get(error.category) || 0;
      categories.set(error.category, count + 1);
    }

    const parts: string[] = [];
    for (const [category, count] of categories) {
      parts.push(`${count} ${category}`);
    }

    return `${errors.length} errors: ${parts.join(', ')}`;
  }

  /**
   * Get highest severity from a list of errors
   */
  private getHighestSeverity(errors: CategorizedError[]): string {
    const severityOrder = [
      ErrorSeverity.INFO,
      ErrorSeverity.WARNING,
      ErrorSeverity.ERROR,
      ErrorSeverity.FATAL,
    ];

    let highest = ErrorSeverity.INFO;

    for (const error of errors) {
      if (severityOrder.indexOf(error.severity) > severityOrder.indexOf(highest)) {
        highest = error.severity;
      }
    }

    return highest;
  }
}
