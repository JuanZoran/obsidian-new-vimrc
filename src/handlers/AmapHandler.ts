/**
 * AmapHandler - Handles Async Action Mapping Commands
 *
 * Processes amap commands that map key sequences to async actions:
 * - amap <key> <actionName> [mode] - Map key to async action (e.g., from plugins like Flash)
 *
 * @module handlers/AmapHandler
 *
 * Requirements:
 * - 5.1: New command types only require new CommandHandler implementation
 */

import { BaseHandler, HandlerDependencies } from './BaseHandler';
import type { ParsedCommand, CommandType } from '../types/commands';
import { CommandType as CT } from '../types/commands';

/**
 * Amap command types that this handler supports
 */
const AMAP_COMMAND_TYPES: CommandType[] = [CT.AMAP];

/**
 * Registered amap command definition
 */
export interface AmapDefinition {
  key: string;
  actionName: string;
  mode: 'normal' | 'insert' | 'visual' | 'all';
  lineNumber: number;
}

/**
 * AmapHandler implementation
 *
 * Handles amap commands that map key sequences to async actions.
 */
export class AmapHandler extends BaseHandler {
  readonly supportedTypes = AMAP_COMMAND_TYPES;

  private amapDefinitions: AmapDefinition[] = [];

  /**
   * Handle an amap command
   * Format: amap <key> <actionName> [mode]
   *
   * Example:
   *   amap s flashJump
   *   amap s flashJump visual
   *
   * @param command - The parsed amap command
   */
  async handle(command: ParsedCommand): Promise<void> {
    const args = command.args;

    if (args.length < 2) {
      this.warn(`amap requires key and action name at line ${command.lineNumber}`);
      return;
    }

    const key = args[0];
    const actionName = args[1];

    // Determine mode from optional third argument, default to 'normal'
    let mode: 'normal' | 'insert' | 'visual' | 'all' = 'normal';
    if (args.length >= 3) {
      const modeArg = args[2].toLowerCase();
      switch (modeArg) {
        case 'normal':
          mode = 'normal';
          break;
        case 'insert':
          mode = 'insert';
          break;
        case 'visual':
          mode = 'visual';
          break;
        case 'all':
          mode = 'all';
          break;
        default:
          this.warn(
            `Unknown mode '${modeArg}' at line ${command.lineNumber}, defaulting to 'normal'`
          );
      }
    }

    // Store amap definition
    const definition: AmapDefinition = {
      key,
      actionName,
      mode,
      lineNumber: command.lineNumber,
    };
    this.amapDefinitions.push(definition);
  }

  /**
   * Get all amap definitions
   */
  getAmapDefinitions(): AmapDefinition[] {
    return [...this.amapDefinitions];
  }

  /**
   * Get count of registered amaps
   */
  getAmapCount(): number {
    return this.amapDefinitions.length;
  }

  /**
   * Get amap definitions for a specific mode
   */
  getAmapDefinitionsForMode(mode: 'normal' | 'insert' | 'visual' | 'all'): AmapDefinition[] {
    return this.amapDefinitions.filter((def) => def.mode === mode || def.mode === 'all');
  }

  /**
   * Find amap definition by key and mode
   */
  findAmapDefinition(
    key: string,
    mode: 'normal' | 'insert' | 'visual'
  ): AmapDefinition | undefined {
    return this.amapDefinitions.find(
      (def) => def.key === key && (def.mode === mode || def.mode === 'all')
    );
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.amapDefinitions = [];
  }
}
