import { CommandType, ParsedCommand, MappingConfig, VimMode, KeyMapping, HandlerContext, CommandHandler } from '../types';

/**
 * Mapping command types that this handler supports
 */
const MAPPING_COMMAND_TYPES = [
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
 * Non-recursive mapping command types
 */
const NON_RECURSIVE_TYPES = [
    CommandType.NOREMAP,
    CommandType.NNOREMAP,
    CommandType.INOREMAP,
    CommandType.VNOREMAP
];

/**
 * Unmap command types
 */
const UNMAP_COMMAND_TYPES = [
    CommandType.UNMAP,
    CommandType.NUNMAP,
    CommandType.IUNMAP,
    CommandType.VUNMAP
];

/**
 * Handles key mapping commands
 */
export class KeyMapper implements CommandHandler {
    readonly commandType = CommandType.MAP;
    private mappings: KeyMapping[] = [];
    private leaderKey: string = '\\';
    private mappingIdCounter: number = 0;

    /**
     * Check if this handler can process the given command
     */
    canHandle(command: ParsedCommand): boolean {
        return MAPPING_COMMAND_TYPES.includes(command.type);
    }

    /**
     * Handle a mapping command
     */
    async handle(command: ParsedCommand, context: HandlerContext): Promise<void> {
        // Handle unmap commands
        if (UNMAP_COMMAND_TYPES.includes(command.type)) {
            await this.handleUnmap(command, context);
            return;
        }

        const config = this.parseMapping(command);
        
        // Create a KeyMapping with metadata
        const mapping: KeyMapping = {
            id: this.generateMappingId(),
            source: config.from,
            target: config.to,
            mode: config.mode,
            recursive: config.recursive,
            lineNumber: command.lineNumber
        };
        
        this.mappings.push(mapping);
        await this.applyMapping(config, context);
    }

    /**
     * Handle unmap command
     * Format: nunmap <key>
     */
    private async handleUnmap(command: ParsedCommand, context: HandlerContext): Promise<void> {
        const key = command.args[0];
        if (!key) {
            console.warn(`[Vimrc] unmap requires a key at line ${command.lineNumber}`);
            return;
        }

        const parsedKey = this.parseKeySequence(key);
        const mode = this.getModeFromUnmapType(command.type);

        // Remove matching mappings
        const initialCount = this.mappings.length;
        this.mappings = this.mappings.filter(m => {
            if (m.source !== parsedKey) return true;
            if (mode === VimMode.ALL) return false;
            return m.mode !== mode && m.mode !== VimMode.ALL;
        });

        if (context.settings.debugMode) {
            const removed = initialCount - this.mappings.length;
            console.log(`[Vimrc] Unmap: ${key} (mode: ${mode}, removed: ${removed})`);
        }
    }

    /**
     * Get VimMode from unmap command type
     */
    private getModeFromUnmapType(type: CommandType): VimMode {
        switch (type) {
            case CommandType.NUNMAP:
                return VimMode.NORMAL;
            case CommandType.IUNMAP:
                return VimMode.INSERT;
            case CommandType.VUNMAP:
                return VimMode.VISUAL;
            case CommandType.UNMAP:
            default:
                return VimMode.ALL;
        }
    }

    /**
     * Parse a mapping command into MappingConfig
     */
    parseMapping(command: ParsedCommand): MappingConfig {
        const [from, ...rest] = command.args;
        // Join the rest as the target (handles cases like `:w<CR>`)
        const to = rest.join(' ');

        if (!from || !to) {
            throw new Error(`Invalid mapping: expected at least 2 arguments, got ${command.args.length}`);
        }

        const mode = this.getModeFromCommandType(command.type);
        const recursive = this.isRecursiveMapping(command.type);

        return {
            from: this.parseKeySequence(from),
            to: this.parseKeySequence(to),
            mode,
            recursive
        };
    }


    /**
     * Determine VimMode from command type
     */
    getModeFromCommandType(type: CommandType): VimMode {
        switch (type) {
            case CommandType.NMAP:
            case CommandType.NNOREMAP:
                return VimMode.NORMAL;
            case CommandType.IMAP:
            case CommandType.INOREMAP:
                return VimMode.INSERT;
            case CommandType.VMAP:
            case CommandType.VNOREMAP:
                return VimMode.VISUAL;
            case CommandType.MAP:
            case CommandType.NOREMAP:
            default:
                return VimMode.ALL;
        }
    }

    /**
     * Check if a command type creates a recursive mapping
     */
    isRecursiveMapping(type: CommandType): boolean {
        return !NON_RECURSIVE_TYPES.includes(type);
    }

    /**
     * Parse key sequence for storage and comparison
     * 
     * Note: We only replace <leader> here. Special keys like <C-u>, <CR>, etc.
     * are kept in their original Vim notation because CodeMirror Vim API
     * expects them in that format and handles the conversion internally.
     */
    parseKeySequence(keys: string): string {
        let result = keys;

        // Replace <leader> with actual leader key (case-insensitive)
        result = result.replace(/<leader>/gi, this.leaderKey);

        // DO NOT convert special keys like <C-u>, <CR>, etc.
        // CodeMirror Vim API expects them in Vim notation format
        // and handles the conversion internally

        return result;
    }

    /**
     * Apply mapping to CodeMirror Vim
     * This method integrates with the CodeMirror Vim extension
     */
    async applyMapping(config: MappingConfig, context: HandlerContext): Promise<void> {
        if (context.settings.debugMode) {
            console.log(`[Vimrc] Mapping: ${config.from} -> ${config.to} (mode: ${config.mode}, recursive: ${config.recursive})`);
        }

        // The actual CodeMirror Vim integration will be done through the plugin
        // when editor instances are available. For now, we store the mapping
        // and it will be applied when setupEditorExtension is called.
        
        // If plugin has a vim instance available, apply immediately
        if (context.plugin && context.plugin.applyMappingToVim) {
            await context.plugin.applyMappingToVim(config);
        }
    }

    /**
     * Set the leader key
     */
    setLeaderKey(key: string): void {
        this.leaderKey = key;
    }

    /**
     * Get the current leader key
     */
    getLeaderKey(): string {
        return this.leaderKey;
    }

    /**
     * Get all mappings
     */
    getMappings(): KeyMapping[] {
        return [...this.mappings];
    }

    /**
     * Get mappings as MappingConfig array (for compatibility)
     */
    getMappingConfigs(): MappingConfig[] {
        return this.mappings.map(m => ({
            from: m.source,
            to: m.target,
            mode: m.mode,
            recursive: m.recursive
        }));
    }

    /**
     * Get mappings for a specific mode
     */
    getMappingsForMode(mode: VimMode): KeyMapping[] {
        return this.mappings.filter(m => m.mode === mode || m.mode === VimMode.ALL);
    }

    /**
     * Clear all mappings
     */
    clearMappings(): void {
        this.mappings = [];
        this.mappingIdCounter = 0;
    }

    /**
     * Remove a specific mapping by ID
     */
    removeMapping(id: string): boolean {
        const index = this.mappings.findIndex(m => m.id === id);
        if (index !== -1) {
            this.mappings.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get the count of mappings
     */
    getMappingCount(): number {
        return this.mappings.length;
    }

    /**
     * Generate a unique mapping ID
     */
    private generateMappingId(): string {
        return `mapping_${++this.mappingIdCounter}`;
    }

    /**
     * Cleanup resources
     */
    cleanup(): void {
        this.clearMappings();
    }
}
