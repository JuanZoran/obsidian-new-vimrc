import { CommandType, ParsedCommand, HandlerContext, CommandHandler } from '../types';

/**
 * Registry for command handlers
 * 
 * This class manages command handlers and routes parsed commands to the appropriate handler.
 * It supports multiple handlers per command type and uses the canHandle method to determine
 * which handler should process a given command.
 * 
 * Requirements:
 * - 6.1: Adding new vimrc command support only requires extending VimrcParser
 * - 6.3: Adding new Obsidian command integration only requires extending CommandExecutor
 */
export class CommandRegistry {
    private handlers: Map<CommandType, CommandHandler[]> = new Map();
    private allHandlers: CommandHandler[] = [];

    /**
     * Register a command handler for a specific command type
     * 
     * @param type - The command type this handler processes
     * @param handler - The handler to register
     */
    register(type: CommandType, handler: CommandHandler): void {
        const existing = this.handlers.get(type) || [];
        existing.push(handler);
        this.handlers.set(type, existing);
        
        // Track unique handlers
        if (!this.allHandlers.includes(handler)) {
            this.allHandlers.push(handler);
        }
    }

    /**
     * Register a handler for multiple command types
     * Useful for handlers like KeyMapper that handle multiple mapping commands
     * 
     * @param types - Array of command types this handler processes
     * @param handler - The handler to register
     */
    registerForTypes(types: CommandType[], handler: CommandHandler): void {
        for (const type of types) {
            this.register(type, handler);
        }
    }

    /**
     * Execute a command by routing it to the appropriate handler
     * 
     * @param command - The parsed command to execute
     * @param context - The handler context containing plugin and settings
     * @throws Error if command execution fails
     */
    async execute(command: ParsedCommand, context: HandlerContext): Promise<void> {
        const handlers = this.handlers.get(command.type) || [];

        // Find a handler that can handle this command
        const handler = handlers.find(h => h.canHandle(command));

        if (!handler) {
            console.warn(`[Vimrc] No handler found for command type: ${command.type}`);
            return;
        }

        try {
            await handler.handle(command, context);
        } catch (error) {
            console.error(`[Vimrc] Error executing command:`, error);
            throw error;
        }
    }

    /**
     * Check if a handler is registered for a command type
     * 
     * @param type - The command type to check
     * @returns true if a handler is registered for this type
     */
    hasHandler(type: CommandType): boolean {
        const handlers = this.handlers.get(type);
        return handlers !== undefined && handlers.length > 0;
    }

    /**
     * Get handlers for a specific command type
     * 
     * @param type - The command type
     * @returns Array of handlers for this type
     */
    getHandlersForType(type: CommandType): CommandHandler[] {
        return this.handlers.get(type) || [];
    }

    /**
     * Get all unique registered handlers
     * 
     * @returns Array of all unique handlers
     */
    getHandlers(): CommandHandler[] {
        return [...this.allHandlers];
    }

    /**
     * Get count of registered command types
     * 
     * @returns Number of command types with registered handlers
     */
    getRegisteredTypeCount(): number {
        return this.handlers.size;
    }

    /**
     * Clear all handlers and call cleanup on each
     */
    clear(): void {
        // Call cleanup on all unique handlers
        for (const handler of this.allHandlers) {
            if (handler.cleanup) {
                handler.cleanup();
            }
        }
        this.handlers.clear();
        this.allHandlers = [];
    }
}


/**
 * Mapping command types that KeyMapper handles
 */
export const MAPPING_COMMAND_TYPES: CommandType[] = [
    CommandType.MAP,
    CommandType.NMAP,
    CommandType.IMAP,
    CommandType.VMAP,
    CommandType.NOREMAP,
    CommandType.NNOREMAP,
    CommandType.INOREMAP,
    CommandType.VNOREMAP,
    // unmap commands
    CommandType.UNMAP,
    CommandType.NUNMAP,
    CommandType.IUNMAP,
    CommandType.VUNMAP
];

/**
 * Command types that CommandExecutor handles
 */
export const EXECUTOR_COMMAND_TYPES: CommandType[] = [
    CommandType.OBCOMMAND,
    CommandType.EXMAP,
    // obmap commands - direct mapping to Obsidian commands
    CommandType.OBMAP,
    CommandType.NOBMAP,
    CommandType.IOBMAP,
    CommandType.VOBMAP
];

/**
 * Create and configure a CommandRegistry with KeyMapper and CommandExecutor
 * 
 * @param keyMapper - The KeyMapper instance to register
 * @param commandExecutor - The CommandExecutor instance to register
 * @returns Configured CommandRegistry
 */
export function createConfiguredRegistry(
    keyMapper: CommandHandler,
    commandExecutor: CommandHandler
): CommandRegistry {
    const registry = new CommandRegistry();
    
    // Register KeyMapper for all mapping command types
    registry.registerForTypes(MAPPING_COMMAND_TYPES, keyMapper);
    
    // Register CommandExecutor for obcommand and exmap
    registry.registerForTypes(EXECUTOR_COMMAND_TYPES, commandExecutor);
    
    return registry;
}
