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

/**
 * Obmap definition for mapping keys to Obsidian commands
 */
export interface ObmapDefinition {
  key: string;
  commandId: string;
  mode: 'normal' | 'insert' | 'visual' | 'all';
  lineNumber: number;
}

/**
 * Exmap definition for ex commands that execute Obsidian commands
 */
export interface ExmapDefinition {
  name: string;
  commandId: string;
  lineNumber: number;
}

/**
 * Provider interface for obmap definitions
 * Decouples VimrcLoader from ObmapHandler implementation
 */
export interface IObmapProvider {
  /**
   * Get all registered obmap definitions
   */
  getObmapDefinitions(): ObmapDefinition[];

  /**
   * Execute an Obsidian command by ID
   */
  executeObsidianCommand(commandId: string): Promise<boolean>;
}

/**
 * Provider interface for exmap definitions
 * Decouples VimrcLoader from ExmapHandler implementation
 */
export interface IExmapProvider {
  /**
   * Get all registered exmap definitions
   */
  getExmapDefinitions(): ExmapDefinition[];

  /**
   * Execute an Obsidian command by ID
   */
  executeObsidianCommand(commandId: string): Promise<boolean>;
}

// ============================================
// Command Type Constants
// Centralized definitions for handler registration
// ============================================

/** All mapping command types (map, nmap, noremap, unmap, etc.) */
export const MAPPING_COMMAND_TYPES: CommandType[] = [
  CommandType.MAP,
  CommandType.NMAP,
  CommandType.IMAP,
  CommandType.VMAP,
  CommandType.NOREMAP,
  CommandType.NNOREMAP,
  CommandType.INOREMAP,
  CommandType.VNOREMAP,
  CommandType.UNMAP,
  CommandType.NUNMAP,
  CommandType.IUNMAP,
  CommandType.VUNMAP,
];

/** Non-recursive mapping command types */
export const NON_RECURSIVE_COMMAND_TYPES: CommandType[] = [
  CommandType.NOREMAP,
  CommandType.NNOREMAP,
  CommandType.INOREMAP,
  CommandType.VNOREMAP,
];

/** Unmap command types */
export const UNMAP_COMMAND_TYPES: CommandType[] = [
  CommandType.UNMAP,
  CommandType.NUNMAP,
  CommandType.IUNMAP,
  CommandType.VUNMAP,
];

/** Obmap command types (direct Obsidian command mapping) */
export const OBMAP_COMMAND_TYPES: CommandType[] = [
  CommandType.OBMAP,
  CommandType.NOBMAP,
  CommandType.IOBMAP,
  CommandType.VOBMAP,
];

/** Exmap command types (ex command definitions) */
export const EXMAP_COMMAND_TYPES: CommandType[] = [
  CommandType.EXMAP,
  CommandType.OBCOMMAND,
];

/** Let command types (variable assignment) */
export const LET_COMMAND_TYPES: CommandType[] = [CommandType.LET];

/** All Obsidian-specific executor command types */
export const EXECUTOR_COMMAND_TYPES: CommandType[] = [
  ...EXMAP_COMMAND_TYPES,
  ...OBMAP_COMMAND_TYPES,
];
