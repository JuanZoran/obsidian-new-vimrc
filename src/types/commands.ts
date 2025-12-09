/**
 * Command-related type definitions
 */

import type { VimrcSettings } from './settings';

/**
 * Supported command types from vimrc files
 */
export enum CommandType {
  // Standard mapping commands
  MAP = 'map',
  NMAP = 'nmap',
  IMAP = 'imap',
  VMAP = 'vmap',

  // Non-recursive mapping commands
  NOREMAP = 'noremap',
  NNOREMAP = 'nnoremap',
  INOREMAP = 'inoremap',
  VNOREMAP = 'vnoremap',

  // Obsidian-specific commands
  OBCOMMAND = 'obcommand',
  EXMAP = 'exmap',

  // Obmap commands - direct mapping to Obsidian commands
  OBMAP = 'obmap',
  NOBMAP = 'nobmap',
  IOBMAP = 'iobmap',
  VOBMAP = 'vobmap',

  // Unmap commands
  UNMAP = 'unmap',
  NUNMAP = 'nunmap',
  IUNMAP = 'iunmap',
  VUNMAP = 'vunmap',

  // Amap commands - mapping to async actions
  AMAP = 'amap',

  // Variable assignment
  LET = 'let',

  // Comments and unknown
  COMMENT = 'comment',
  UNKNOWN = 'unknown',
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
 * Context passed to command handlers
 */
export interface HandlerContext {
  plugin: unknown; // Will be typed as VimrcPlugin once defined
  settings: VimrcSettings;
}

/**
 * Command handler interface
 */
export interface ICommandHandler {
  /**
   * Command types this handler supports
   */
  readonly supportedTypes: CommandType[];

  /**
   * Check if this handler can process the given command
   */
  canHandle(command: ParsedCommand): boolean;

  /**
   * Process the command
   */
  handle(command: ParsedCommand): Promise<void>;

  /**
   * Cleanup resources when handler is disposed
   */
  cleanup(): void;
}

/**
 * Command registry interface
 */
export interface ICommandRegistry {
  /**
   * Register a command handler
   */
  register(handler: ICommandHandler): void;

  /**
   * Unregister a command handler
   */
  unregister(handler: ICommandHandler): void;

  /**
   * Route a command to the appropriate handler
   */
  route(command: ParsedCommand): Promise<void>;

  /**
   * Get all registered handlers
   */
  getHandlers(): ICommandHandler[];

  /**
   * Cleanup all handlers
   */
  cleanup(): void;
}
