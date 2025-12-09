/**
 * ObsidianCommandExecutor - Shared Obsidian Command Execution Logic
 *
 * Provides common functionality for handlers that execute Obsidian commands:
 * - Command validation
 * - Command execution
 * - Valid/invalid command tracking
 *
 * @module handlers/ObsidianCommandExecutor
 */

import { App, Notice } from 'obsidian';

/**
 * Validation result for command existence check
 */
export interface CommandValidationResult {
  valid: boolean;
  errorMessage?: string;
}

/**
 * ObsidianCommandExecutor - Shared logic for Obsidian command handling
 */
export class ObsidianCommandExecutor {
  private app: App;
  private validatedCommands: Set<string> = new Set();
  private invalidCommands: Set<string> = new Set();

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Validate that a command exists in Obsidian
   */
  validateCommand(commandId: string): CommandValidationResult {
    if (!commandId || commandId.trim() === '') {
      return { valid: false, errorMessage: 'Command ID cannot be empty' };
    }

    // @ts-ignore - commands is available on app
    const commands = this.app.commands?.commands;

    if (!commands) {
      // Commands not available yet, assume valid
      return { valid: true };
    }

    if (!(commandId in commands)) {
      return { valid: false, errorMessage: `Obsidian command not found: '${commandId}'` };
    }

    return { valid: true };
  }

  /**
   * Validate and track a command
   * Shows Notice if invalid
   */
  validateAndTrack(commandId: string, showNotice = true): boolean {
    const result = this.validateCommand(commandId);

    if (result.valid) {
      this.validatedCommands.add(commandId);
      return true;
    }

    if (showNotice && result.errorMessage) {
      new Notice(`Vimrc warning: ${result.errorMessage}`);
    }
    this.invalidCommands.add(commandId);
    return false;
  }

  /**
   * Execute an Obsidian command by ID
   */
  async execute(commandId: string): Promise<boolean> {
    try {
      if (this.invalidCommands.has(commandId)) {
        new Notice(`Command not found: ${commandId}`);
        return false;
      }

      // @ts-ignore - commands is available on app
      await this.app.commands.executeCommandById(commandId);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to execute command '${commandId}': ${errorMessage}`);
      console.error(`[Vimrc] Failed to execute command ${commandId}:`, error);
      return false;
    }
  }

  /**
   * Check if a command ID was validated as valid
   */
  isValid(commandId: string): boolean {
    return this.validatedCommands.has(commandId);
  }

  /**
   * Check if a command ID was validated as invalid
   */
  isInvalid(commandId: string): boolean {
    return this.invalidCommands.has(commandId);
  }

  /**
   * Get all invalid command IDs
   */
  getInvalidCommands(): string[] {
    return Array.from(this.invalidCommands);
  }

  /**
   * Clear all tracked commands
   */
  clear(): void {
    this.validatedCommands.clear();
    this.invalidCommands.clear();
  }
}
