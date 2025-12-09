/**
 * ObmapHandler - Handles Obsidian Command Mapping Commands
 *
 * Processes obmap commands that map key sequences directly to Obsidian commands:
 * - obmap <key> <command-id> (all modes)
 * - nobmap <key> <command-id> (normal mode)
 * - iobmap <key> <command-id> (insert mode)
 * - vobmap <key> <command-id> (visual mode)
 *
 * @module handlers/ObmapHandler
 */

import { App } from 'obsidian';
import { BaseHandler, HandlerDependencies } from './BaseHandler';
import { ObsidianCommandExecutor } from './ObsidianCommandExecutor';
import type { ParsedCommand, CommandType } from '../types/commands';
import { CommandType as CT } from '../types/commands';
import { getLogger } from '../services/Logger';

const log = getLogger('obmap');

/**
 * Obmap command types that this handler supports
 */
const OBMAP_COMMAND_TYPES: CommandType[] = [CT.OBMAP, CT.NOBMAP, CT.IOBMAP, CT.VOBMAP];

/**
 * Registered obmap command definition
 */
export interface ObmapDefinition {
  key: string;
  commandId: string;
  mode: 'normal' | 'insert' | 'visual' | 'all';
  lineNumber: number;
}

/**
 * Dependencies for ObmapHandler
 */
export interface ObmapHandlerDependencies extends HandlerDependencies {
  app: App;
}

/**
 * ObmapHandler implementation
 */
export class ObmapHandler extends BaseHandler {
  readonly supportedTypes = OBMAP_COMMAND_TYPES;

  private commandExecutor: ObsidianCommandExecutor;
  private obmapDefinitions: ObmapDefinition[] = [];

  constructor(deps: ObmapHandlerDependencies) {
    super(deps);
    this.commandExecutor = new ObsidianCommandExecutor(deps.app);
  }

  async handle(command: ParsedCommand): Promise<void> {
    const args = command.args;

    if (args.length < 2) {
      this.warn(`obmap requires key and command ID at line ${command.lineNumber}`);
      return;
    }

    const key = args[0];
    const commandId = args[1];
    const mode = this.getModeFromCommandType(command.type);

    log.debug(`Processing obmap: ${key} -> ${commandId} (${mode})`);

    // Validate and track command
    const isValid = this.commandExecutor.validateAndTrack(commandId);
    if (!isValid) {
      log.warn(`Invalid command: ${commandId}`);
      this.warn(`Invalid command: ${commandId}`);
    }

    // Store obmap definition
    this.obmapDefinitions.push({ key, commandId, mode, lineNumber: command.lineNumber });
  }

  private getModeFromCommandType(type: CommandType): 'normal' | 'insert' | 'visual' | 'all' {
    switch (type) {
      case CT.NOBMAP: return 'normal';
      case CT.IOBMAP: return 'insert';
      case CT.VOBMAP: return 'visual';
      default: return 'all';
    }
  }

  /** Execute an Obsidian command by ID */
  executeObsidianCommand(commandId: string): Promise<boolean> {
    log.debug(`Executing command: ${commandId}`);
    return this.commandExecutor.execute(commandId);
  }

  /** Get all obmap definitions */
  getObmapDefinitions(): ObmapDefinition[] {
    return [...this.obmapDefinitions];
  }

  /** Get count of registered obmaps */
  getObmapCount(): number {
    return this.obmapDefinitions.length;
  }

  /** Check if a command ID was validated as valid */
  isCommandValid(commandId: string): boolean {
    return this.commandExecutor.isValid(commandId);
  }

  /** Check if a command ID was validated as invalid */
  isCommandInvalid(commandId: string): boolean {
    return this.commandExecutor.isInvalid(commandId);
  }

  /** Get all invalid command IDs */
  getInvalidCommands(): string[] {
    return this.commandExecutor.getInvalidCommands();
  }

  cleanup(): void {
    this.obmapDefinitions = [];
    this.commandExecutor.clear();
  }
}
