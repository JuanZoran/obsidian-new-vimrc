/**
 * LetHandler - Handles Variable Assignment Commands
 *
 * Processes let commands for variable assignment:
 * - let mapleader = "<Space>" - Set the leader key
 * - let g:variable = value - Set global variables
 *
 * @module handlers/LetHandler
 *
 * Requirements:
 * - 5.1: New command types only require new CommandHandler implementation
 */

import { BaseHandler, HandlerDependencies } from './BaseHandler';
import type { ParsedCommand, CommandType } from '../types/commands';
import { CommandType as CT } from '../types/commands';

/**
 * Let command types that this handler supports
 */
const LET_COMMAND_TYPES: CommandType[] = [CT.LET];

/**
 * Variable definition
 */
export interface VariableDefinition {
  name: string;
  value: string;
  lineNumber: number;
}

/**
 * Callback for when leader key changes
 */
export type LeaderKeyChangeCallback = (newLeader: string) => void;

/**
 * Dependencies for LetHandler
 */
export interface LetHandlerDependencies extends HandlerDependencies {
  onLeaderKeyChange?: LeaderKeyChangeCallback;
}

/**
 * LetHandler implementation
 *
 * Handles let commands for variable assignment, particularly the mapleader variable.
 */
export class LetHandler extends BaseHandler {
  readonly supportedTypes = LET_COMMAND_TYPES;

  private variables: Map<string, VariableDefinition> = new Map();
  private leaderKey: string = '\\';
  private onLeaderKeyChange?: LeaderKeyChangeCallback;

  /**
   * Create a new LetHandler
   *
   * @param deps - Handler dependencies
   */
  constructor(deps: LetHandlerDependencies) {
    super(deps);
    this.onLeaderKeyChange = deps.onLeaderKeyChange;
  }

  /**
   * Handle a let command
   * Format: let <variable> = <value>
   *
   * @param command - The parsed let command
   */
  async handle(command: ParsedCommand): Promise<void> {
    // Parse the let command
    // Format: let mapleader = "<Space>"
    // args might be: ["mapleader", "=", "\"<Space>\""] or ["mapleader=<Space>"]

    const args = command.args;
    if (args.length === 0) {
      this.warn(`let requires variable assignment at line ${command.lineNumber}`);
      return;
    }

    // Try to parse different formats
    let varName: string;
    let value: string;

    if (args.length >= 3 && args[1] === '=') {
      // Format: let varName = value
      varName = args[0];
      value = args.slice(2).join(' ');
    } else if (args.length === 1 && args[0].includes('=')) {
      // Format: let varName=value
      const parts = args[0].split('=');
      varName = parts[0];
      value = parts.slice(1).join('=');
    } else if (args.length >= 2 && args[0].endsWith('=')) {
      // Format: let varName= value
      varName = args[0].slice(0, -1);
      value = args.slice(1).join(' ');
    } else if (args.length >= 2 && args[1].startsWith('=')) {
      // Format: let varName =value
      varName = args[0];
      value = args[1].slice(1) + (args.length > 2 ? ' ' + args.slice(2).join(' ') : '');
    } else {
      this.warn(`Invalid let syntax at line ${command.lineNumber}: ${command.raw}`);
      return;
    }

    // Clean up the value (remove quotes)
    value = this.parseValue(value);

    // Store the variable
    const definition: VariableDefinition = {
      name: varName,
      value,
      lineNumber: command.lineNumber,
    };
    this.variables.set(varName, definition);

    // Handle special variables
    if (varName === 'mapleader' || varName === 'g:mapleader') {
      this.setLeaderKey(value);
    }
  }

  /**
   * Parse a value, removing quotes and handling special keys
   */
  private parseValue(value: string): string {
    // Remove surrounding quotes
    let result = value.trim();
    if (
      (result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'"))
    ) {
      result = result.slice(1, -1);
    }

    // Handle special key notations
    result = this.parseSpecialKeys(result);

    return result;
  }

  /**
   * Parse special key notations like <Space>, <CR>, etc.
   */
  private parseSpecialKeys(value: string): string {
    // Map of special key notations to their actual values
    const specialKeys: Record<string, string> = {
      '<Space>': ' ',
      '<space>': ' ',
      '<CR>': '\n',
      '<cr>': '\n',
      '<Tab>': '\t',
      '<tab>': '\t',
      '<Esc>': '\x1b',
      '<esc>': '\x1b',
      '<BS>': '\b',
      '<bs>': '\b',
    };

    let result = value;
    for (const [key, replacement] of Object.entries(specialKeys)) {
      result = result.replace(new RegExp(key, 'gi'), replacement);
    }

    return result;
  }

  /**
   * Set the leader key
   */
  private setLeaderKey(key: string): void {
    this.leaderKey = key;
    if (this.onLeaderKeyChange) {
      this.onLeaderKeyChange(key);
    }
  }

  /**
   * Get the current leader key
   */
  getLeaderKey(): string {
    return this.leaderKey;
  }

  /**
   * Get a variable value by name
   */
  getVariable(name: string): string | undefined {
    return this.variables.get(name)?.value;
  }

  /**
   * Get all variables
   */
  getVariables(): VariableDefinition[] {
    return Array.from(this.variables.values());
  }

  /**
   * Get count of registered variables
   */
  getVariableCount(): number {
    return this.variables.size;
  }

  /**
   * Set the callback for leader key changes
   */
  setOnLeaderKeyChange(callback: LeaderKeyChangeCallback): void {
    this.onLeaderKeyChange = callback;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.variables.clear();
    this.leaderKey = '\\';
  }
}
