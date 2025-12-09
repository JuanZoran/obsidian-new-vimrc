/**
 * MappingHandler - Handles Key Mapping Commands
 *
 * Processes standard Vim mapping commands:
 * - map, nmap, imap, vmap (recursive mappings)
 * - noremap, nnoremap, inoremap, vnoremap (non-recursive mappings)
 * - unmap, nunmap, iunmap, vunmap (remove mappings)
 *
 * Stores mappings in MappingStore for later application via MappingApplier.
 *
 * @module handlers/MappingHandler
 *
 * Requirements:
 * - 5.1: New command types only require new CommandHandler implementation
 * - 8.1: Mapping commands store configuration in MappingStore
 */

import { BaseHandler, HandlerDependencies } from './BaseHandler';
import type { IMappingStore, KeyMapping } from '../types/mappings';
import { VimMode, MappingStatus } from '../types/mappings';
import type { ParsedCommand, CommandType } from '../types/commands';
import {
  CommandType as CT,
  MAPPING_COMMAND_TYPES,
  NON_RECURSIVE_COMMAND_TYPES,
  UNMAP_COMMAND_TYPES,
} from '../types/commands';
import { getLogger } from '../services/Logger';

const log = getLogger('mapping');

/**
 * Dependencies for MappingHandler
 */
export interface MappingHandlerDependencies extends HandlerDependencies {
  mappingStore: IMappingStore;
}

/**
 * MappingHandler implementation
 *
 * Handles all standard Vim mapping commands and stores them in MappingStore.
 */
export class MappingHandler extends BaseHandler {
  readonly supportedTypes = MAPPING_COMMAND_TYPES;

  private mappingStore: IMappingStore;
  private leaderKey: string = '\\';
  private mappingIdCounter: number = 0;

  /**
   * Create a new MappingHandler
   *
   * @param deps - Handler dependencies including MappingStore
   */
  constructor(deps: MappingHandlerDependencies) {
    super(deps, 'mapping');
    this.mappingStore = deps.mappingStore;
  }

  /**
   * Handle a mapping command
   *
   * @param command - The parsed mapping command
   */
  async handle(command: ParsedCommand): Promise<void> {
    // Handle unmap commands
    if (UNMAP_COMMAND_TYPES.includes(command.type)) {
      await this.handleUnmap(command);
      return;
    }

    // Handle regular mapping commands
    await this.handleMapping(command);
  }

  /**
   * Handle a regular mapping command (map, nmap, noremap, etc.)
   */
  private async handleMapping(command: ParsedCommand): Promise<void> {
    const [from, ...rest] = command.args;
    const to = rest.join(' ');

    if (!from || !to) {
      this.warn(`Invalid mapping at line ${command.lineNumber}: expected at least 2 arguments`);
      return;
    }

    const mode = this.getModeFromCommandType(command.type);
    const recursive = this.isRecursiveMapping(command.type);

    // Create mapping with metadata
    const mapping: KeyMapping = {
      id: this.generateMappingId(),
      source: this.parseKeySequence(from),
      target: this.parseKeySequence(to),
      mode,
      recursive,
      lineNumber: command.lineNumber,
      createdAt: Date.now(),
      status: MappingStatus.PENDING,
    };

    log.debug(`Adding mapping: ${mapping.source} -> ${mapping.target} (${mode}, ${recursive ? 'recursive' : 'noremap'})`);

    // Store in MappingStore (Requirement 8.1)
    this.mappingStore.add(mapping);
  }

  /**
   * Handle unmap command
   * Format: nunmap <key>
   */
  private async handleUnmap(command: ParsedCommand): Promise<void> {
    const key = command.args[0];
    if (!key) {
      this.warn(`unmap requires a key at line ${command.lineNumber}`);
      return;
    }

    const parsedKey = this.parseKeySequence(key);
    const mode = this.getModeFromUnmapType(command.type);

    log.debug(`Unmapping: ${parsedKey} (${mode})`);

    // Remove matching mappings from store
    this.mappingStore.removeBySource(parsedKey, mode === 'all' ? undefined : mode);
  }

  /**
   * Get VimMode from command type
   */
  private getModeFromCommandType(type: CommandType): VimMode {
    switch (type) {
      case CT.NMAP:
      case CT.NNOREMAP:
        return VimMode.NORMAL;
      case CT.IMAP:
      case CT.INOREMAP:
        return VimMode.INSERT;
      case CT.VMAP:
      case CT.VNOREMAP:
        return VimMode.VISUAL;
      case CT.MAP:
      case CT.NOREMAP:
      default:
        return VimMode.ALL;
    }
  }

  /**
   * Get VimMode from unmap command type
   */
  private getModeFromUnmapType(type: CommandType): VimMode {
    switch (type) {
      case CT.NUNMAP:
        return VimMode.NORMAL;
      case CT.IUNMAP:
        return VimMode.INSERT;
      case CT.VUNMAP:
        return VimMode.VISUAL;
      case CT.UNMAP:
      default:
        return VimMode.ALL;
    }
  }

  /**
   * Check if a command type creates a recursive mapping
   */
  private isRecursiveMapping(type: CommandType): boolean {
    return !NON_RECURSIVE_COMMAND_TYPES.includes(type);
  }

  /**
   * Parse key sequence, replacing <leader> with actual leader key
   *
   * Note: Special keys like <C-u>, <CR>, etc. are kept in Vim notation
   * because CodeMirror Vim API expects them in that format.
   */
  private parseKeySequence(keys: string): string {
    // Replace <leader> with actual leader key (case-insensitive)
    return keys.replace(/<leader>/gi, this.leaderKey);
  }

  /**
   * Generate a unique mapping ID
   */
  private generateMappingId(): string {
    return `mapping_${++this.mappingIdCounter}`;
  }

  /**
   * Set the leader key
   */
  setLeaderKey(key: string): void {
    log.debug(`Leader key set to: ${key}`);
    this.leaderKey = key;
  }

  /**
   * Get the current leader key
   */
  getLeaderKey(): string {
    return this.leaderKey;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.mappingIdCounter = 0;
  }
}
