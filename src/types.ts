/**
 * Core type definitions for the Vimrc plugin
 */

/**
 * Supported command types from vimrc files
 */
export enum CommandType {
    MAP = 'map',
    NMAP = 'nmap',
    IMAP = 'imap',
    VMAP = 'vmap',
    NOREMAP = 'noremap',
    NNOREMAP = 'nnoremap',
    INOREMAP = 'inoremap',
    VNOREMAP = 'vnoremap',
    OBCOMMAND = 'obcommand',
    EXMAP = 'exmap',
    // obmap commands - direct mapping to Obsidian commands
    OBMAP = 'obmap',
    NOBMAP = 'nobmap',
    IOBMAP = 'iobmap',
    VOBMAP = 'vobmap',
    // unmap commands
    UNMAP = 'unmap',
    NUNMAP = 'nunmap',
    IUNMAP = 'iunmap',
    VUNMAP = 'vunmap',
    // amap commands - mapping to async actions
    AMAP = 'amap',
    LET = 'let',
    COMMENT = 'comment',
    UNKNOWN = 'unknown'
}

/**
 * Vim editing modes
 */
export enum VimMode {
    NORMAL = 'normal',
    INSERT = 'insert',
    VISUAL = 'visual',
    ALL = 'all'
}

/**
 * Parsed command from vimrc file
 */
export interface ParsedCommand {
    type: CommandType;
    args: string[];
    lineNumber: number;
    raw: string;
}

/**
 * Result of parsing a vimrc file
 */
export interface ParseResult {
    commands: ParsedCommand[];
    errors: ParseError[];
    warnings: ParseWarning[];
}

/**
 * Parse error information
 */
export interface ParseError {
    lineNumber: number;
    message: string;
    raw: string;
}

/**
 * Parse warning information
 */
export interface ParseWarning {
    lineNumber: number;
    message: string;
    raw: string;
}

/**
 * Configuration for a key mapping
 */
export interface MappingConfig {
    from: string;
    to: string;
    mode: VimMode;
    recursive: boolean;
}

/**
 * Key mapping with metadata
 */
export interface KeyMapping {
    id: string;
    source: string;
    target: string;
    mode: VimMode;
    recursive: boolean;
    lineNumber: number;
}

/**
 * Plugin settings
 */
export interface VimrcSettings {
    vimrcPath: string;
    showLoadNotification: boolean;
    debugMode: boolean;
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: VimrcSettings = {
    vimrcPath: '.obsidian.vimrc',
    showLoadNotification: false,
    debugMode: false
};

/**
 * Context passed to command handlers
 */
export interface HandlerContext {
    plugin: any; // Will be typed as VimrcPlugin once defined
    settings: VimrcSettings;
}

/**
 * Command handler interface
 */
export interface CommandHandler {
    readonly commandType: CommandType;
    canHandle(command: ParsedCommand): boolean;
    handle(command: ParsedCommand, context: HandlerContext): Promise<void>;
    cleanup?(): void;
}

/**
 * Special key mappings from Vim notation to actual keys
 */
export const SPECIAL_KEYS: Record<string, string> = {
    '<CR>': '\n',
    '<Enter>': '\n',
    '<Return>': '\n',
    '<Esc>': '\x1b',
    '<Space>': ' ',
    '<Tab>': '\t',
    '<BS>': '\b',
    '<Backspace>': '\b',
    '<Del>': '\x7f',
    '<Delete>': '\x7f',
    '<Up>': 'ArrowUp',
    '<Down>': 'ArrowDown',
    '<Left>': 'ArrowLeft',
    '<Right>': 'ArrowRight',
    '<Home>': 'Home',
    '<End>': 'End',
    '<PageUp>': 'PageUp',
    '<PageDown>': 'PageDown',
    '<C-a>': 'Ctrl-a',
    '<C-b>': 'Ctrl-b',
    '<C-c>': 'Ctrl-c',
    '<C-d>': 'Ctrl-d',
    '<C-e>': 'Ctrl-e',
    '<C-f>': 'Ctrl-f',
    '<C-g>': 'Ctrl-g',
    '<C-h>': 'Ctrl-h',
    '<C-i>': 'Ctrl-i',
    '<C-j>': 'Ctrl-j',
    '<C-k>': 'Ctrl-k',
    '<C-l>': 'Ctrl-l',
    '<C-m>': 'Ctrl-m',
    '<C-n>': 'Ctrl-n',
    '<C-o>': 'Ctrl-o',
    '<C-p>': 'Ctrl-p',
    '<C-q>': 'Ctrl-q',
    '<C-r>': 'Ctrl-r',
    '<C-s>': 'Ctrl-s',
    '<C-t>': 'Ctrl-t',
    '<C-u>': 'Ctrl-u',
    '<C-v>': 'Ctrl-v',
    '<C-w>': 'Ctrl-w',
    '<C-x>': 'Ctrl-x',
    '<C-y>': 'Ctrl-y',
    '<C-z>': 'Ctrl-z',
};

/**
 * Error types for different error scenarios
 */
export interface FileError extends Error {
    code?: string;
    path?: string;
}

export interface CommandError extends Error {
    command?: ParsedCommand;
}
