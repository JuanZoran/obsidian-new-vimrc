import { Notice } from 'obsidian';
import { ParseError, ParseWarning, ParsedCommand, VimrcSettings, FileError, CommandError } from '../types';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error'
}

/**
 * Structured error report
 */
export interface ErrorReport {
    severity: ErrorSeverity;
    message: string;
    lineNumber?: number;
    raw?: string;
    code?: string;
    path?: string;
}

/**
 * ErrorHandler - Centralized error handling for the Vimrc plugin
 * 
 * Requirements:
 * - 5.1: Log warning for unrecognized commands but continue processing
 * - 5.2: Show error message with line number for syntax errors
 * - 5.4: Silent failure when vimrc file doesn't exist
 */
export class ErrorHandler {
    private settings: VimrcSettings;
    private errorLog: ErrorReport[] = [];

    constructor(settings: VimrcSettings) {
        this.settings = settings;
    }

    /**
     * Update settings reference
     */
    updateSettings(settings: VimrcSettings): void {
        this.settings = settings;
    }

    /**
     * Handle parse error from VimrcParser
     * Shows user-friendly error message with file name, line number, and description
     * 
     * Requirement 5.2: Show error message with line number
     */
    handleParseError(error: ParseError): void {
        const report: ErrorReport = {
            severity: ErrorSeverity.ERROR,
            message: error.message,
            lineNumber: error.lineNumber,
            raw: error.raw
        };

        this.logError(report);

        // Show user notification with line number
        new Notice(`Vimrc 解析错误 (行 ${error.lineNumber}): ${error.message}`);
        console.error('[Vimrc] Parse error:', error);
    }

    /**
     * Handle multiple parse errors
     */
    handleParseErrors(errors: ParseError[]): void {
        for (const error of errors) {
            this.handleParseError(error);
        }
    }

    /**
     * Handle parse warning (e.g., unknown command)
     * Logs warning but doesn't interrupt execution
     * 
     * Requirement 5.1: Log warning for unrecognized commands
     */
    handleParseWarning(warning: ParseWarning): void {
        const report: ErrorReport = {
            severity: ErrorSeverity.WARNING,
            message: warning.message,
            lineNumber: warning.lineNumber,
            raw: warning.raw
        };

        this.logError(report);

        console.warn(`[Vimrc] Warning (line ${warning.lineNumber}): ${warning.message}`);
        
        // Only show notice in debug mode to avoid spamming user
        if (this.settings.debugMode) {
            new Notice(`Vimrc 警告 (行 ${warning.lineNumber}): ${warning.message}`);
        }
    }

    /**
     * Handle multiple parse warnings
     */
    handleParseWarnings(warnings: ParseWarning[]): void {
        for (const warning of warnings) {
            this.handleParseWarning(warning);
        }
    }

    /**
     * Handle command execution error
     * Logs error but doesn't crash the plugin
     */
    handleCommandError(error: CommandError, command?: ParsedCommand): void {
        const report: ErrorReport = {
            severity: ErrorSeverity.ERROR,
            message: error.message,
            lineNumber: command?.lineNumber
        };

        this.logError(report);

        console.warn('[Vimrc] Command error:', error);
        
        if (this.settings.debugMode) {
            const lineInfo = command ? ` (行 ${command.lineNumber})` : '';
            new Notice(`命令执行失败${lineInfo}: ${error.message}`);
        }
    }

    /**
     * Handle file system error
     * Silent failure for file not found, shows notification for other errors
     * 
     * Requirement 5.4: Silent failure when file doesn't exist
     */
    handleFileError(error: FileError, path?: string): void {
        const report: ErrorReport = {
            severity: ErrorSeverity.ERROR,
            message: error.message,
            code: error.code,
            path: path || error.path
        };

        this.logError(report);

        // Silent failure for file not found (Requirement 5.4)
        if (error.code === 'ENOENT' || error.message.includes('not found')) {
            console.log(`[Vimrc] No vimrc file found at ${path || error.path}, skipping`);
            return;
        }

        // Show notification for other file errors
        new Notice(`无法读取 vimrc 文件: ${error.message}`);
        console.error('[Vimrc] File error:', error);
    }

    /**
     * Handle generic error
     */
    handleError(error: Error, context?: string): void {
        const report: ErrorReport = {
            severity: ErrorSeverity.ERROR,
            message: error.message
        };

        this.logError(report);

        const contextInfo = context ? ` [${context}]` : '';
        console.error(`[Vimrc]${contextInfo} Error:`, error);

        if (this.settings.debugMode) {
            new Notice(`Vimrc 错误${contextInfo}: ${error.message}`);
        }
    }

    /**
     * Log an info message
     */
    logInfo(message: string): void {
        const report: ErrorReport = {
            severity: ErrorSeverity.INFO,
            message
        };

        this.logError(report);

        if (this.settings.debugMode) {
            console.log(`[Vimrc] ${message}`);
        }
    }

    /**
     * Log an error report to internal log
     */
    private logError(report: ErrorReport): void {
        this.errorLog.push(report);
        
        // Keep log size manageable
        if (this.errorLog.length > 100) {
            this.errorLog.shift();
        }
    }

    /**
     * Get all logged errors
     */
    getErrorLog(): ErrorReport[] {
        return [...this.errorLog];
    }

    /**
     * Get errors by severity
     */
    getErrorsBySeverity(severity: ErrorSeverity): ErrorReport[] {
        return this.errorLog.filter(e => e.severity === severity);
    }

    /**
     * Get error count by severity
     */
    getErrorCount(severity?: ErrorSeverity): number {
        if (severity) {
            return this.errorLog.filter(e => e.severity === severity).length;
        }
        return this.errorLog.length;
    }

    /**
     * Clear error log
     */
    clearErrorLog(): void {
        this.errorLog = [];
    }

    /**
     * Check if there are any errors
     */
    hasErrors(): boolean {
        return this.errorLog.some(e => e.severity === ErrorSeverity.ERROR);
    }

    /**
     * Check if there are any warnings
     */
    hasWarnings(): boolean {
        return this.errorLog.some(e => e.severity === ErrorSeverity.WARNING);
    }

    /**
     * Generate summary of errors and warnings
     */
    getSummary(): string {
        const errors = this.getErrorCount(ErrorSeverity.ERROR);
        const warnings = this.getErrorCount(ErrorSeverity.WARNING);
        
        const parts: string[] = [];
        if (errors > 0) {
            parts.push(`${errors} 个错误`);
        }
        if (warnings > 0) {
            parts.push(`${warnings} 个警告`);
        }
        
        return parts.length > 0 ? parts.join(', ') : '无错误';
    }
}
