import { App, Notice } from 'obsidian';
import { CommandType, ParsedCommand, HandlerContext, CommandHandler } from '../types';

/**
 * Result of command validation
 */
export interface CommandValidationResult {
    valid: boolean;
    commandId: string;
    errorMessage?: string;
}

/**
 * Registered exmap command definition
 */
export interface ExmapDefinition {
    name: string;
    commandId: string;
    lineNumber: number;
}

/**
 * Registered obmap command definition
 * Maps a key sequence directly to an Obsidian command
 */
export interface ObmapDefinition {
    key: string;
    commandId: string;
    mode: 'normal' | 'insert' | 'visual' | 'all';
    lineNumber: number;
}

/**
 * Executes Obsidian commands from vimrc
 * Handles both obcommand and exmap directives
 * 
 * Requirements:
 * - 3.1: obcommand directive maps to Obsidian commands
 * - 3.2: Execute Obsidian command when triggered
 * - 3.3: Show warning for invalid command ID at load time
 * - 3.4: No notification on successful execution
 * - 3.5: Show error notification on execution failure
 */
export class CommandExecutor implements CommandHandler {
    readonly commandType = CommandType.OBCOMMAND;
    private app: App;
    private exmapDefinitions: Map<string, ExmapDefinition> = new Map();
    private obmapDefinitions: ObmapDefinition[] = [];
    private validatedCommands: Set<string> = new Set();
    private invalidCommands: Set<string> = new Set();

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Check if this handler can process the given command
     */
    canHandle(command: ParsedCommand): boolean {
        return command.type === CommandType.OBCOMMAND || 
               command.type === CommandType.EXMAP ||
               command.type === CommandType.OBMAP ||
               command.type === CommandType.NOBMAP ||
               command.type === CommandType.IOBMAP ||
               command.type === CommandType.VOBMAP;
    }

    /**
     * Handle obcommand, exmap, or obmap command from vimrc
     * 
     * obcommand format: obcommand <command-id>
     * exmap format: exmap <name> obcommand <command-id>
     * obmap format: nobmap <key> <command-id>
     */
    async handle(command: ParsedCommand, context: HandlerContext): Promise<void> {
        if (command.type === CommandType.EXMAP) {
            await this.handleExmap(command, context);
        } else if (command.type === CommandType.OBCOMMAND) {
            await this.handleObcommand(command, context);
        } else if (command.type === CommandType.OBMAP ||
                   command.type === CommandType.NOBMAP ||
                   command.type === CommandType.IOBMAP ||
                   command.type === CommandType.VOBMAP) {
            await this.handleObmap(command, context);
        }
    }

    /**
     * Handle exmap command
     * Format: exmap <name> obcommand <command-id>
     */
    private async handleExmap(command: ParsedCommand, context: HandlerContext): Promise<void> {
        const args = command.args;
        
        // exmap <name> obcommand <command-id>
        // args[0] = name, args[1] = obcommand, args[2] = command-id
        if (args.length < 3) {
            console.warn(`[Vimrc] Invalid exmap syntax at line ${command.lineNumber}: expected 'exmap <name> obcommand <command-id>'`);
            return;
        }

        const name = args[0];
        const directive = args[1].toLowerCase();
        const commandId = args[2];

        if (directive !== 'obcommand') {
            console.warn(`[Vimrc] Unknown exmap directive '${directive}' at line ${command.lineNumber}`);
            return;
        }

        // Validate command exists at load time (Requirement 3.3)
        const validation = this.validateCommandExists(commandId);
        if (!validation.valid) {
            new Notice(`Vimrc warning: ${validation.errorMessage}`);
            console.warn(`[Vimrc] ${validation.errorMessage}`);
            this.invalidCommands.add(commandId);
        } else {
            this.validatedCommands.add(commandId);
        }

        // Store exmap definition
        const definition: ExmapDefinition = {
            name,
            commandId,
            lineNumber: command.lineNumber
        };
        this.exmapDefinitions.set(name, definition);

        if (context.settings.debugMode) {
            console.log(`[Vimrc] Registered exmap: ${name} -> ${commandId} (valid: ${validation.valid})`);
        }
    }

    /**
     * Handle direct obcommand
     * Format: obcommand <command-id>
     */
    private async handleObcommand(command: ParsedCommand, context: HandlerContext): Promise<void> {
        const commandId = command.args[0];

        if (!commandId) {
            console.warn(`[Vimrc] obcommand requires a command ID at line ${command.lineNumber}`);
            return;
        }

        // Validate command exists at load time (Requirement 3.3)
        const validation = this.validateCommandExists(commandId);
        if (!validation.valid) {
            new Notice(`Vimrc warning: ${validation.errorMessage}`);
            console.warn(`[Vimrc] ${validation.errorMessage}`);
            this.invalidCommands.add(commandId);
        } else {
            this.validatedCommands.add(commandId);
        }

        if (context.settings.debugMode) {
            console.log(`[Vimrc] Registered obcommand: ${commandId} (valid: ${validation.valid})`);
        }
    }

    /**
     * Handle obmap command - direct mapping of key to Obsidian command
     * Format: nobmap <key> <command-id>
     *         iobmap <key> <command-id>
     *         vobmap <key> <command-id>
     *         obmap <key> <command-id>
     */
    private async handleObmap(command: ParsedCommand, context: HandlerContext): Promise<void> {
        const args = command.args;
        
        if (args.length < 2) {
            console.warn(`[Vimrc] obmap requires key and command ID at line ${command.lineNumber}`);
            return;
        }

        const key = args[0];
        const commandId = args[1];

        // Determine mode from command type
        let mode: 'normal' | 'insert' | 'visual' | 'all';
        switch (command.type) {
            case CommandType.NOBMAP:
                mode = 'normal';
                break;
            case CommandType.IOBMAP:
                mode = 'insert';
                break;
            case CommandType.VOBMAP:
                mode = 'visual';
                break;
            case CommandType.OBMAP:
            default:
                mode = 'all';
                break;
        }

        // Validate command exists at load time
        const validation = this.validateCommandExists(commandId);
        if (!validation.valid) {
            new Notice(`Vimrc warning: ${validation.errorMessage}`);
            console.warn(`[Vimrc] ${validation.errorMessage}`);
            this.invalidCommands.add(commandId);
        } else {
            this.validatedCommands.add(commandId);
        }

        // Store obmap definition
        const definition: ObmapDefinition = {
            key,
            commandId,
            mode,
            lineNumber: command.lineNumber
        };
        this.obmapDefinitions.push(definition);

        if (context.settings.debugMode) {
            console.log(`[Vimrc] Registered obmap: ${key} -> ${commandId} (mode: ${mode}, valid: ${validation.valid})`);
        }
    }

    /**
     * Execute an Obsidian command by ID
     * Called when user triggers a mapped key sequence
     * 
     * Requirements:
     * - 3.2: Execute the Obsidian command
     * - 3.4: No notification on success
     * - 3.5: Show error notification on failure
     */
    async executeObsidianCommand(commandId: string): Promise<boolean> {
        try {
            // Check if command was previously validated as invalid
            if (this.invalidCommands.has(commandId)) {
                new Notice(`Command not found: ${commandId}`);
                return false;
            }

            // @ts-ignore - commands is available on app
            const result = await this.app.commands.executeCommandById(commandId);
            
            // Requirement 3.4: No notification on success
            return true;
        } catch (error) {
            // Requirement 3.5: Show error notification on failure
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`Failed to execute command '${commandId}': ${errorMessage}`);
            console.error(`[Vimrc] Failed to execute command ${commandId}:`, error);
            return false;
        }
    }

    /**
     * Execute an exmap command by name
     */
    async executeExmap(name: string): Promise<boolean> {
        const definition = this.exmapDefinitions.get(name);
        if (!definition) {
            console.warn(`[Vimrc] Unknown exmap: ${name}`);
            return false;
        }

        return this.executeObsidianCommand(definition.commandId);
    }

    /**
     * Validate that a command exists in Obsidian
     * Returns validation result with error message if invalid
     * 
     * Requirement 3.3: Validate command ID at load time
     */
    validateCommandExists(commandId: string): CommandValidationResult {
        if (!commandId || commandId.trim() === '') {
            return {
                valid: false,
                commandId: commandId || '',
                errorMessage: 'Command ID cannot be empty'
            };
        }

        // @ts-ignore - commands is available on app
        const commands = this.app.commands?.commands;
        
        if (!commands) {
            // Commands not available yet, assume valid
            return {
                valid: true,
                commandId
            };
        }

        const exists = commandId in commands;
        
        if (!exists) {
            return {
                valid: false,
                commandId,
                errorMessage: `Obsidian command not found: '${commandId}'`
            };
        }

        return {
            valid: true,
            commandId
        };
    }

    /**
     * Get an exmap definition by name
     */
    getExmapDefinition(name: string): ExmapDefinition | undefined {
        return this.exmapDefinitions.get(name);
    }

    /**
     * Get all exmap definitions
     */
    getExmapDefinitions(): ExmapDefinition[] {
        return Array.from(this.exmapDefinitions.values());
    }

    /**
     * Get count of registered exmaps
     */
    getExmapCount(): number {
        return this.exmapDefinitions.size;
    }

    /**
     * Get all obmap definitions
     */
    getObmapDefinitions(): ObmapDefinition[] {
        return [...this.obmapDefinitions];
    }

    /**
     * Get count of registered obmaps
     */
    getObmapCount(): number {
        return this.obmapDefinitions.length;
    }

    /**
     * Check if a command ID was validated as valid
     */
    isCommandValid(commandId: string): boolean {
        return this.validatedCommands.has(commandId);
    }

    /**
     * Check if a command ID was validated as invalid
     */
    isCommandInvalid(commandId: string): boolean {
        return this.invalidCommands.has(commandId);
    }

    /**
     * Get all invalid command IDs
     */
    getInvalidCommands(): string[] {
        return Array.from(this.invalidCommands);
    }

    /**
     * Clear all registered commands and exmaps
     */
    cleanup(): void {
        this.exmapDefinitions.clear();
        this.obmapDefinitions = [];
        this.validatedCommands.clear();
        this.invalidCommands.clear();
    }
}
