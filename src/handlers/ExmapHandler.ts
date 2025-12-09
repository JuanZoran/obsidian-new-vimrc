/**
 * ExmapHandler - Handles Ex Command Mapping and Obsidian Command Execution
 *
 * Processes exmap and obcommand commands:
 * - exmap <name> obcommand <command-id> - Define an ex command that executes an Obsidian command
 * - obcommand <command-id> - Direct Obsidian command execution
 *
 * @module handlers/ExmapHandler
 */

import { App } from 'obsidian';
import { BaseHandler, HandlerDependencies } from './BaseHandler';
import { ObsidianCommandExecutor } from './ObsidianCommandExecutor';
import type { ParsedCommand, CommandType, IExmapProvider, ExmapDefinition } from '../types/commands';
import { CommandType as CT, EXMAP_COMMAND_TYPES } from '../types/commands';
import { getLogger } from '../services/Logger';

const log = getLogger('exmap');

// Re-export for backward compatibility
export type { ExmapDefinition } from '../types/commands';

/**
 * Dependencies for ExmapHandler
 */
export interface ExmapHandlerDependencies extends HandlerDependencies {
  app: App;
}

/**
 * ExmapHandler implementation
 * Implements IExmapProvider for decoupled access from VimrcLoader
 */
export class ExmapHandler extends BaseHandler implements IExmapProvider {
  readonly supportedTypes = EXMAP_COMMAND_TYPES;

  private commandExecutor: ObsidianCommandExecutor;
  private exmapDefinitions: Map<string, ExmapDefinition> = new Map();

  constructor(deps: ExmapHandlerDependencies) {
    super(deps, 'exmap');
    this.commandExecutor = new ObsidianCommandExecutor(deps.app);
  }

  async handle(command: ParsedCommand): Promise<void> {
    if (command.type === CT.EXMAP) {
      await this.handleExmap(command);
    } else if (command.type === CT.OBCOMMAND) {
      await this.handleObcommand(command);
    }
  }

  /**
   * Handle exmap command
   * Format: exmap <name> obcommand <command-id>
   */
  private async handleExmap(command: ParsedCommand): Promise<void> {
    const args = command.args;

    if (args.length < 3) {
      this.warn(`Invalid exmap syntax at line ${command.lineNumber}: expected 'exmap <name> obcommand <command-id>'`);
      return;
    }

    const name = args[0];
    const directive = args[1].toLowerCase();
    const commandId = args[2];

    if (directive !== 'obcommand') {
      this.warn(`Unknown exmap directive '${directive}' at line ${command.lineNumber}`);
      return;
    }

    log.debug(`Processing exmap: :${name} -> ${commandId}`);

    // Validate and track command
    const isValid = this.commandExecutor.validateAndTrack(commandId);
    if (!isValid) {
      log.warn(`Invalid command: ${commandId}`);
      this.warn(`Invalid command: ${commandId}`);
    }

    // Store exmap definition
    this.exmapDefinitions.set(name, { name, commandId, lineNumber: command.lineNumber });
  }

  /**
   * Handle direct obcommand
   * Format: obcommand <command-id>
   */
  private async handleObcommand(command: ParsedCommand): Promise<void> {
    const commandId = command.args[0];

    if (!commandId) {
      this.warn(`obcommand requires a command ID at line ${command.lineNumber}`);
      return;
    }

    // Validate and track command
    const isValid = this.commandExecutor.validateAndTrack(commandId);
    if (!isValid) {
      this.warn(`Invalid command: ${commandId}`);
    }
  }

  /** Execute an Obsidian command by ID */
  executeObsidianCommand(commandId: string): Promise<boolean> {
    return this.commandExecutor.execute(commandId);
  }

  /** Execute an exmap command by name */
  async executeExmap(name: string): Promise<boolean> {
    const definition = this.exmapDefinitions.get(name);
    if (!definition) {
      log.warn(`Unknown exmap: ${name}`);
      this.warn(`Unknown exmap: ${name}`);
      return false;
    }
    log.debug(`Executing exmap: :${name} -> ${definition.commandId}`);
    return this.commandExecutor.execute(definition.commandId);
  }

  /** Get an exmap definition by name */
  getExmapDefinition(name: string): ExmapDefinition | undefined {
    return this.exmapDefinitions.get(name);
  }

  /** Get all exmap definitions */
  getExmapDefinitions(): ExmapDefinition[] {
    return Array.from(this.exmapDefinitions.values());
  }

  /** Get count of registered exmaps */
  getExmapCount(): number {
    return this.exmapDefinitions.size;
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
    this.exmapDefinitions.clear();
    this.commandExecutor.clear();
  }
}
