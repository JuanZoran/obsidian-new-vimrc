import { ErrorHandler, ErrorSeverity, ErrorReport } from '../../src/errors/ErrorHandler';
import { ParseError, ParseWarning, VimrcSettings, DEFAULT_SETTINGS, FileError, CommandError, CommandType, ParsedCommand } from '../../src/types';

// Mock Notice from obsidian
jest.mock('obsidian', () => ({
    Notice: jest.fn()
}));

import { Notice } from 'obsidian';

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;
    let settings: VimrcSettings;

    beforeEach(() => {
        jest.clearAllMocks();
        settings = { ...DEFAULT_SETTINGS, debugMode: false };
        errorHandler = new ErrorHandler(settings);
    });

    describe('handleParseError', () => {
        it('should show notification with line number for parse errors', () => {
            const error: ParseError = {
                lineNumber: 5,
                message: 'Invalid syntax',
                raw: 'invalid command'
            };

            errorHandler.handleParseError(error);

            expect(Notice).toHaveBeenCalledWith('Vimrc 解析错误 (行 5): Invalid syntax');
            expect(errorHandler.hasErrors()).toBe(true);
        });

        it('should log error to internal log', () => {
            const error: ParseError = {
                lineNumber: 10,
                message: 'Test error',
                raw: 'test'
            };

            errorHandler.handleParseError(error);

            const log = errorHandler.getErrorLog();
            expect(log).toHaveLength(1);
            expect(log[0].severity).toBe(ErrorSeverity.ERROR);
            expect(log[0].lineNumber).toBe(10);
        });

        it('should handle multiple parse errors', () => {
            const errors: ParseError[] = [
                { lineNumber: 1, message: 'Error 1', raw: 'line1' },
                { lineNumber: 2, message: 'Error 2', raw: 'line2' }
            ];

            errorHandler.handleParseErrors(errors);

            expect(Notice).toHaveBeenCalledTimes(2);
            expect(errorHandler.getErrorCount(ErrorSeverity.ERROR)).toBe(2);
        });
    });

    describe('handleParseWarning', () => {
        it('should log warning without notification when debug mode is off', () => {
            const warning: ParseWarning = {
                lineNumber: 3,
                message: 'Unknown command: foo',
                raw: 'foo bar'
            };

            errorHandler.handleParseWarning(warning);

            // Notice should not be called when debug mode is off
            expect(Notice).not.toHaveBeenCalled();
            expect(errorHandler.hasWarnings()).toBe(true);
        });

        it('should show notification when debug mode is on', () => {
            settings.debugMode = true;
            errorHandler.updateSettings(settings);

            const warning: ParseWarning = {
                lineNumber: 3,
                message: 'Unknown command: foo',
                raw: 'foo bar'
            };

            errorHandler.handleParseWarning(warning);

            expect(Notice).toHaveBeenCalledWith('Vimrc 警告 (行 3): Unknown command: foo');
        });

        it('should handle multiple warnings', () => {
            const warnings: ParseWarning[] = [
                { lineNumber: 1, message: 'Warning 1', raw: 'w1' },
                { lineNumber: 2, message: 'Warning 2', raw: 'w2' }
            ];

            errorHandler.handleParseWarnings(warnings);

            expect(errorHandler.getErrorCount(ErrorSeverity.WARNING)).toBe(2);
        });
    });

    describe('handleCommandError', () => {
        it('should log command error', () => {
            const error: CommandError = new Error('Command failed') as CommandError;
            const command: ParsedCommand = {
                type: CommandType.NMAP,
                args: ['jk', '<Esc>'],
                lineNumber: 7,
                raw: 'nmap jk <Esc>'
            };

            errorHandler.handleCommandError(error, command);

            expect(errorHandler.hasErrors()).toBe(true);
            const log = errorHandler.getErrorLog();
            expect(log[0].lineNumber).toBe(7);
        });

        it('should show notification in debug mode', () => {
            settings.debugMode = true;
            errorHandler.updateSettings(settings);

            const error: CommandError = new Error('Execution failed') as CommandError;
            const command: ParsedCommand = {
                type: CommandType.OBCOMMAND,
                args: ['invalid:command'],
                lineNumber: 15,
                raw: 'obcommand invalid:command'
            };

            errorHandler.handleCommandError(error, command);

            expect(Notice).toHaveBeenCalledWith('命令执行失败 (行 15): Execution failed');
        });
    });

    describe('handleFileError', () => {
        it('should silently handle file not found errors', () => {
            const error: FileError = new Error('File not found') as FileError;
            error.code = 'ENOENT';

            errorHandler.handleFileError(error, '.vimrc');

            // Should not show notification for file not found
            expect(Notice).not.toHaveBeenCalled();
        });

        it('should show notification for other file errors', () => {
            const error: FileError = new Error('Permission denied') as FileError;
            error.code = 'EACCES';

            errorHandler.handleFileError(error, '.vimrc');

            expect(Notice).toHaveBeenCalledWith('无法读取 vimrc 文件: Permission denied');
        });

        it('should handle errors with "not found" in message', () => {
            const error: FileError = new Error('File not found at path') as FileError;

            errorHandler.handleFileError(error, '.obsidian.vimrc');

            // Should not show notification
            expect(Notice).not.toHaveBeenCalled();
        });
    });

    describe('handleError', () => {
        it('should log generic errors', () => {
            const error = new Error('Something went wrong');

            errorHandler.handleError(error, 'test context');

            expect(errorHandler.hasErrors()).toBe(true);
        });

        it('should show notification in debug mode', () => {
            settings.debugMode = true;
            errorHandler.updateSettings(settings);

            const error = new Error('Generic error');

            errorHandler.handleError(error, 'context');

            expect(Notice).toHaveBeenCalledWith('Vimrc 错误 [context]: Generic error');
        });
    });

    describe('error log management', () => {
        it('should clear error log', () => {
            const error: ParseError = {
                lineNumber: 1,
                message: 'Test',
                raw: 'test'
            };

            errorHandler.handleParseError(error);
            expect(errorHandler.getErrorLog()).toHaveLength(1);

            errorHandler.clearErrorLog();
            expect(errorHandler.getErrorLog()).toHaveLength(0);
        });

        it('should get errors by severity', () => {
            const error: ParseError = { lineNumber: 1, message: 'Error', raw: 'e' };
            const warning: ParseWarning = { lineNumber: 2, message: 'Warning', raw: 'w' };

            errorHandler.handleParseError(error);
            errorHandler.handleParseWarning(warning);

            expect(errorHandler.getErrorsBySeverity(ErrorSeverity.ERROR)).toHaveLength(1);
            expect(errorHandler.getErrorsBySeverity(ErrorSeverity.WARNING)).toHaveLength(1);
        });

        it('should limit log size to 100 entries', () => {
            for (let i = 0; i < 110; i++) {
                errorHandler.handleParseError({
                    lineNumber: i,
                    message: `Error ${i}`,
                    raw: `line ${i}`
                });
            }

            expect(errorHandler.getErrorLog()).toHaveLength(100);
        });
    });

    describe('getSummary', () => {
        it('should return "无错误" when no errors', () => {
            expect(errorHandler.getSummary()).toBe('无错误');
        });

        it('should summarize errors and warnings', () => {
            errorHandler.handleParseError({ lineNumber: 1, message: 'E1', raw: 'e1' });
            errorHandler.handleParseError({ lineNumber: 2, message: 'E2', raw: 'e2' });
            errorHandler.handleParseWarning({ lineNumber: 3, message: 'W1', raw: 'w1' });

            expect(errorHandler.getSummary()).toBe('2 个错误, 1 个警告');
        });
    });

    describe('updateSettings', () => {
        it('should update settings reference', () => {
            const newSettings: VimrcSettings = {
                ...DEFAULT_SETTINGS,
                debugMode: true
            };

            errorHandler.updateSettings(newSettings);

            // Verify by checking that debug mode notification is shown
            const warning: ParseWarning = {
                lineNumber: 1,
                message: 'Test',
                raw: 'test'
            };

            errorHandler.handleParseWarning(warning);
            expect(Notice).toHaveBeenCalled();
        });
    });
});
