import { Plugin, Notice, TAbstractFile } from 'obsidian';
import { 
    VimrcParser, 
    KeyMapper, 
    CommandExecutor, 
    SettingsManager, 
    VimrcSettingTab,
    CommandRegistry,
    createConfiguredRegistry,
    ErrorHandler,
    VimrcSettings,
    DEFAULT_SETTINGS,
    ParseResult,
    MappingConfig,
    VimMode,
    CommandType,
    HandlerContext
} from './src';

// CodeMirror Vim API type declarations
declare global {
    interface Window {
        CodeMirrorAdapter?: {
            Vim?: VimApi;
        };
    }
}

/**
 * CodeMirror position interface
 */
interface CmPos {
    line: number;
    ch: number;
}

/**
 * Motion result returned by motion callbacks
 */
interface MotionResult {
    line: number;
    ch: number;
}

/**
 * Motion arguments passed to motion callbacks
 */
interface MotionArgs {
    repeat?: number;
    forward?: boolean;
    selectedCharacter?: string;
    linewise?: boolean;
    inclusive?: boolean;
}

/**
 * Motion callback function type
 */
type MotionCallback = (cm: any, head: CmPos, motionArgs: MotionArgs, vim: any) => MotionResult;

/**
 * Action callback function type
 */
type ActionCallback = (cm: any, actionArgs: any, vim: any) => void;

/**
 * Operator callback function type
 */
type OperatorCallback = (cm: any, operatorArgs: any, ranges: any[], oldAnchor: CmPos, newHead: CmPos) => void;

interface VimApi {
    defineEx: (name: string, prefix: string, callback: (cm: any, params: any) => void) => void;
    defineAction: (name: string, callback: ActionCallback) => void;
    defineMotion: (name: string, callback: MotionCallback) => void;
    defineOperator: (name: string, callback: OperatorCallback) => void;
    mapCommand: (keys: string, type: string, name: string, args?: any, extra?: { context?: string }) => void;
    map: (lhs: string, rhs: string, mode?: string) => void;
    noremap: (lhs: string, rhs: string, mode?: string) => void;
    unmap: (lhs: string, mode?: string) => void;
    mapclear: (mode?: string) => void;
}

/**
 * VimrcPlugin - Main plugin class for vimrc support in Obsidian
 * 
 * Requirements:
 * - 1.1: Auto-detect and load .obsidian.vimrc file
 * - 1.2: Load .vimrc if .obsidian.vimrc doesn't exist
 * - 1.3: Auto-reload on file modification
 * - 1.4: Show error notification with line number for syntax errors
 * - 1.5: Output loaded mapping count to console
 * - 8.1, 8.2: Apply config to all editor instances
 * - 8.4: Cleanup all mappings on unload
 * - 8.5: Clear old config before applying new config on reload
 */
export default class VimrcPlugin extends Plugin {
    settings: VimrcSettings = DEFAULT_SETTINGS;
    parser!: VimrcParser;
    keyMapper!: KeyMapper;
    commandExecutor!: CommandExecutor;
    registry!: CommandRegistry;
    settingsManager!: SettingsManager;
    errorHandler!: ErrorHandler;
    
    private lastParseResult: ParseResult | null = null;
    private fileWatcherRegistered: boolean = false;
    private debounceTimer: NodeJS.Timeout | null = null;
    
    // Track registered async motions and pending amaps
    private registeredAsyncMotions: Set<string> = new Set();
    private pendingAmaps: Map<string, Array<{ key: string; mode: 'normal' | 'insert' | 'visual' | 'all' }>> = new Map();

    async onload(): Promise<void> {
        console.log('[Vimrc] Loading plugin...');

        // Load settings first (needed by ErrorHandler)
        this.settingsManager = new SettingsManager(this);
        this.settings = await this.settingsManager.loadSettings();

        // Initialize components with proper dependencies
        // ErrorHandler needs settings for debug mode
        this.errorHandler = new ErrorHandler(this.settings);
        
        // Parser is standalone
        this.parser = new VimrcParser();
        
        // KeyMapper and CommandExecutor are command handlers
        this.keyMapper = new KeyMapper();
        this.commandExecutor = new CommandExecutor(this.app);
        
        // Registry connects handlers to command types
        this.registry = createConfiguredRegistry(this.keyMapper, this.commandExecutor);

        // Add settings tab
        this.addSettingTab(new VimrcSettingTab(this.app, this));

        // Setup editor extension for CodeMirror Vim integration
        this.setupEditorExtension();

        // Setup file watcher for auto-reload
        this.setupFileWatcher();

        // Load vimrc file
        // Wait for layout ready to ensure vault is accessible
        this.app.workspace.onLayoutReady(async () => {
            await this.loadVimrc();
        });

        console.log('[Vimrc] Plugin loaded');
    }

    onunload(): void {
        console.log('[Vimrc] Unloading plugin...');

        // Cleanup all mappings (Requirement 8.4)
        this.cleanupMappings();

        // Clear debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        console.log('[Vimrc] Plugin unloaded');
    }


    /**
     * Load vimrc file from vault
     * 
     * Requirements:
     * - 1.1: Auto-detect .obsidian.vimrc
     * - 1.2: Fall back to .vimrc if .obsidian.vimrc doesn't exist
     * - 1.4: Show error notification with line number
     * - 1.5: Output loaded mapping count
     */
    async loadVimrc(): Promise<void> {
        // Clear previous error log for fresh load
        this.errorHandler.clearErrorLog();
        
        try {
            // Detect vimrc file path with priority
            const vimrcPath = await this.detectVimrcFile();
            
            if (!vimrcPath) {
                this.errorHandler.logInfo('No vimrc file found');
                return;
            }

            // Read file content
            const content = await this.readVimrcFile(vimrcPath);
            
            if (content === null) {
                return;
            }

            // Parse vimrc content
            this.parser.clearVariables();
            const result = this.parser.parse(content);
            this.lastParseResult = result;

            // Handle parse errors and warnings through ErrorHandler
            if (result.errors.length > 0) {
                this.errorHandler.handleParseErrors(result.errors);
            }
            if (result.warnings.length > 0) {
                this.errorHandler.handleParseWarnings(result.warnings);
            }

            // Apply configuration
            await this.applyConfiguration(result);

            // Show notifications and log results
            this.reportLoadResults(result, vimrcPath);

        } catch (error) {
            this.errorHandler.handleError(
                error instanceof Error ? error : new Error(String(error)),
                'loadVimrc'
            );
        }
    }

    /**
     * Detect which vimrc file to load
     * Priority: custom path > .obsidian.vimrc > .vimrc
     * 
     * Note: We use vault.adapter.exists() because .vimrc files are not markdown
     * and won't be indexed by Obsidian's vault API (getFiles/getAbstractFileByPath)
     * 
     * Requirements:
     * - 1.1: .obsidian.vimrc has priority
     * - 1.2: Fall back to .vimrc
     * - 4.2: Support custom path from settings
     */
    private async detectVimrcFile(): Promise<string | null> {
        const adapter = this.app.vault.adapter;

        // Check custom path first if specified and different from default
        if (this.settings.vimrcPath && this.settings.vimrcPath !== '.obsidian.vimrc') {
            const customExists = await adapter.exists(this.settings.vimrcPath);
            if (customExists) {
                console.log(`[Vimrc] Using custom path: ${this.settings.vimrcPath}`);
                return this.settings.vimrcPath;
            }
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Custom path not found: ${this.settings.vimrcPath}`);
            }
        }

        // Check .obsidian.vimrc (Requirement 1.1)
        const obsidianVimrcExists = await adapter.exists('.obsidian.vimrc');
        if (this.settings.debugMode) {
            console.log('[Vimrc] Checking .obsidian.vimrc exists:', obsidianVimrcExists);
        }
        if (obsidianVimrcExists) {
            console.log('[Vimrc] Found .obsidian.vimrc');
            return '.obsidian.vimrc';
        }

        // Fall back to .vimrc (Requirement 1.2)
        const vimrcExists = await adapter.exists('.vimrc');
        if (this.settings.debugMode) {
            console.log('[Vimrc] Checking .vimrc exists:', vimrcExists);
        }
        if (vimrcExists) {
            console.log('[Vimrc] Found .vimrc (fallback)');
            return '.vimrc';
        }

        return null;
    }

    /**
     * Read vimrc file content
     * 
     * Note: We use vault.adapter.read() because .vimrc files are not markdown
     * and won't be accessible via vault.read() which requires TFile
     */
    private async readVimrcFile(path: string): Promise<string | null> {
        try {
            const adapter = this.app.vault.adapter;
            
            // Check if file exists first
            const exists = await adapter.exists(path);
            if (!exists) {
                // File not found - silent failure per Requirement 5.4
                const fileError = new Error(`File not found: ${path}`) as any;
                fileError.code = 'ENOENT';
                fileError.path = path;
                this.errorHandler.handleFileError(fileError, path);
                return null;
            }
            
            // Read file content directly from adapter
            return await adapter.read(path);
        } catch (error) {
            // Use ErrorHandler for file read errors
            const fileError = error instanceof Error ? error : new Error(String(error));
            (fileError as any).path = path;
            this.errorHandler.handleFileError(fileError as any, path);
            return null;
        }
    }


    /**
     * Apply parsed configuration
     * 
     * Requirement 1.5: Output loaded mapping count
     */
    private async applyConfiguration(result: ParseResult): Promise<void> {
        const context: HandlerContext = {
            plugin: this,
            settings: this.settings
        };

        // Process each command through the registry
        for (const command of result.commands) {
            // Skip unknown commands (they generate warnings but shouldn't be executed)
            if (command.type === CommandType.UNKNOWN) {
                continue;
            }

            // Skip let commands (already processed by parser for variable substitution)
            if (command.type === CommandType.LET) {
                continue;
            }

            try {
                await this.registry.execute(command, context);
            } catch (error) {
                // Use ErrorHandler for command execution errors
                const commandError = error instanceof Error ? error : new Error(String(error));
                this.errorHandler.handleCommandError(commandError as any, command);
            }
        }

        // After processing all commands, apply mappings to CodeMirror Vim
        this.applyAllMappingsToVim();
    }

    /**
     * Report load results to console and optionally show notification
     * 
     * Requirements:
     * - 1.4: Show error notification with line number
     * - 1.5: Output loaded mapping count
     * - 4.3: Show notification if enabled
     * - 5.2: Show error message with line number
     * - 5.5: Report success count and skipped lines
     */
    private reportLoadResults(result: ParseResult, path: string): void {
        const mappingCount = this.keyMapper.getMappingCount();
        const exmapCount = this.commandExecutor.getExmapCount();
        const summary = this.parser.getSummary(result);

        // Log to console (Requirement 1.5)
        console.log(`[Vimrc] Loaded from ${path}: ${summary}`);
        
        if (this.settings.debugMode) {
            console.log(`[Vimrc] Mappings: ${mappingCount}, Exmaps: ${exmapCount}`);
            if (result.errors.length > 0) {
                console.log('[Vimrc] Errors:', result.errors);
            }
            if (result.warnings.length > 0) {
                console.log('[Vimrc] Warnings:', result.warnings);
            }
        }

        // Show error notifications (Requirement 1.4, 5.2)
        for (const error of result.errors) {
            new Notice(`Vimrc error (line ${error.lineNumber}): ${error.message}`);
        }

        // Show load notification if enabled (Requirement 4.3)
        if (this.settings.showLoadNotification) {
            new Notice(`Vimrc loaded: ${mappingCount} mapping(s)`);
        }
    }

    /**
     * Reload vimrc configuration
     * 
     * Requirement 8.5: Clear old config before applying new
     */
    async reloadVimrc(): Promise<void> {
        if (this.settings.debugMode) {
            console.log('[Vimrc] Reloading configuration...');
        }

        // Clear old mappings first (Requirement 8.5)
        this.cleanupMappings();

        // Load new configuration
        await this.loadVimrc();
    }

    /**
     * Save settings
     */
    async saveSettings(): Promise<void> {
        await this.settingsManager.saveSettings(this.settings);
        // Update ErrorHandler with new settings (for debug mode changes)
        this.errorHandler.updateSettings(this.settings);
    }


    /**
     * Setup file watcher for auto-reload
     * 
     * Requirement 1.3: Auto-reload on file modification
     */
    private setupFileWatcher(): void {
        if (this.fileWatcherRegistered) {
            return;
        }

        this.registerEvent(
            this.app.vault.on('modify', (file: TAbstractFile) => {
                if (this.isVimrcFile(file)) {
                    this.debouncedReload();
                }
            })
        );

        this.fileWatcherRegistered = true;
        
        if (this.settings.debugMode) {
            console.log('[Vimrc] File watcher registered');
        }
    }

    /**
     * Check if a file is a vimrc file
     */
    private isVimrcFile(file: TAbstractFile): boolean {
        const path = file.path;
        return path === this.settings.vimrcPath ||
               path === '.vimrc' ||
               path === '.obsidian.vimrc';
    }

    /**
     * Debounced reload to prevent rapid reloads
     * Uses 500ms debounce as specified in design
     */
    private debouncedReload(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            if (this.settings.debugMode) {
                console.log('[Vimrc] File changed, reloading...');
            }
            await this.reloadVimrc();
        }, 500);
    }

    /**
     * Setup CodeMirror editor extension
     * 
     * Requirements:
     * - 8.1: Apply config to all editor instances
     * - 8.2: Apply config to new editor panes
     */
    private setupEditorExtension(): void {
        // Register editor extension to apply mappings to each editor instance
        this.registerEditorExtension([]);
        
        if (this.settings.debugMode) {
            console.log('[Vimrc] Editor extension setup complete');
        }
    }

    /**
     * Get the CodeMirror Vim API
     * Obsidian exposes this through window.CodeMirrorAdapter.Vim
     */
    private getVimApi(): VimApi | null {
        // Try to get Vim API from window
        const vimApi = (window as any).CodeMirrorAdapter?.Vim;
        if (vimApi) {
            return vimApi;
        }

        // Fallback: try to access through app
        // @ts-ignore
        const cmAdapter = this.app.workspace?.activeEditor?.editor?.cm?.cm;
        if (cmAdapter) {
            // @ts-ignore
            return (window as any).CodeMirrorAdapter?.Vim || null;
        }

        return null;
    }

    /**
     * Apply all stored mappings to CodeMirror Vim
     */
    private applyAllMappingsToVim(): void {
        const vimApi = this.getVimApi();
        
        if (!vimApi) {
            console.warn('[Vimrc] CodeMirror Vim API not available');
            return;
        }

        // Apply regular key mappings
        const mappings = this.keyMapper.getMappings();
        for (const mapping of mappings) {
            try {
                // In Vim, map/noremap (without mode prefix) only applies to normal, visual, and operator-pending modes
                // NOT to insert mode. So for VimMode.ALL, we apply to normal and visual only.
                if (mapping.mode === VimMode.ALL) {
                    // Apply to normal and visual modes only (matching Vim behavior)
                    if (mapping.recursive) {
                        vimApi.map(mapping.source, mapping.target, 'normal');
                        vimApi.map(mapping.source, mapping.target, 'visual');
                    } else {
                        vimApi.noremap(mapping.source, mapping.target, 'normal');
                        vimApi.noremap(mapping.source, mapping.target, 'visual');
                    }
                    
                    if (this.settings.debugMode) {
                        console.log(`[Vimrc] Applied to Vim: ${mapping.source} -> ${mapping.target} (mode: normal+visual, recursive: ${mapping.recursive})`);
                    }
                } else {
                    const mode = this.vimModeToString(mapping.mode);
                    if (mapping.recursive) {
                        vimApi.map(mapping.source, mapping.target, mode);
                    } else {
                        vimApi.noremap(mapping.source, mapping.target, mode);
                    }
                    
                    if (this.settings.debugMode) {
                        console.log(`[Vimrc] Applied to Vim: ${mapping.source} -> ${mapping.target} (mode: ${mode}, recursive: ${mapping.recursive})`);
                    }
                }
            } catch (error) {
                console.error(`[Vimrc] Failed to apply mapping ${mapping.source}:`, error);
            }
        }

        // Apply obmap commands (direct Obsidian command mappings)
        // Using defineAction + mapCommand for a cleaner implementation
        const obmaps = this.commandExecutor.getObmapDefinitions();
        for (let i = 0; i < obmaps.length; i++) {
            const obmap = obmaps[i];
            try {
                // Create a unique action name using index to avoid collisions
                const actionName = `obmap_${i}`;
                
                // Define a custom action that executes the Obsidian command
                vimApi.defineAction(actionName, () => {
                    this.commandExecutor.executeObsidianCommand(obmap.commandId);
                });

                // Map the key directly to the action based on mode
                // mapCommand(keys, type, name, args, extra)
                // type: 'action' for custom actions
                // extra.context: 'normal', 'visual', 'insert'
                if (obmap.mode === 'insert') {
                    vimApi.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'insert' });
                } else if (obmap.mode === 'all') {
                    // Apply to all modes
                    vimApi.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'normal' });
                    vimApi.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'visual' });
                    vimApi.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'insert' });
                } else {
                    // Normal or visual mode
                    vimApi.mapCommand(obmap.key, 'action', actionName, undefined, { context: obmap.mode });
                }
                
                if (this.settings.debugMode) {
                    console.log(`[Vimrc] Applied obmap to Vim: ${obmap.key} -> ${obmap.commandId} (mode: ${obmap.mode}, action: ${actionName})`);
                }
            } catch (error) {
                console.error(`[Vimrc] Failed to apply obmap ${obmap.key}:`, error);
            }
        }

        // Apply exmap commands
        const exmaps = this.commandExecutor.getExmapDefinitions();
        for (const exmap of exmaps) {
            try {
                // Define the ex command
                vimApi.defineEx(exmap.name, exmap.name, () => {
                    this.commandExecutor.executeObsidianCommand(exmap.commandId);
                });
                
                if (this.settings.debugMode) {
                    console.log(`[Vimrc] Defined ex command: ${exmap.name} -> ${exmap.commandId}`);
                }
            } catch (error) {
                console.error(`[Vimrc] Failed to define exmap ${exmap.name}:`, error);
            }
        }

        // Apply amap commands (mapping keys to async motions defined by other plugins)
        // These are deferred until the async motion is registered via defineAsyncMotion
        const amaps = this.commandExecutor.getAmapDefinitions();
        let appliedAmaps = 0;
        for (const amap of amaps) {
            // Check if the async motion is already registered
            if (this.registeredAsyncMotions.has(amap.actionName)) {
                // Action already registered, apply immediately
                try {
                    this.applyAmapToVim(vimApi, amap.key, amap.actionName, amap.mode);
                    appliedAmaps++;
                } catch (error) {
                    console.error(`[Vimrc] Failed to apply amap ${amap.key}:`, error);
                }
            } else {
                // Action not yet registered, store as pending
                const pending = this.pendingAmaps.get(amap.actionName) || [];
                pending.push({ key: amap.key, mode: amap.mode });
                this.pendingAmaps.set(amap.actionName, pending);
                
                if (this.settings.debugMode) {
                    console.log(`[Vimrc] Deferred amap: ${amap.key} -> ${amap.actionName} (waiting for action registration)`);
                }
            }
        }

        const pendingCount = amaps.length - appliedAmaps;
        console.log(`[Vimrc] Applied ${mappings.length} mappings, ${obmaps.length} obmaps, ${exmaps.length} exmaps, ${appliedAmaps} amaps to Vim (${pendingCount} amaps pending)`);
    }

    /**
     * Convert VimMode enum to string for CodeMirror Vim API
     */
    private vimModeToString(mode: VimMode): string | undefined {
        switch (mode) {
            case VimMode.NORMAL:
                return 'normal';
            case VimMode.INSERT:
                return 'insert';
            case VimMode.VISUAL:
                return 'visual';
            case VimMode.ALL:
            default:
                return undefined; // undefined means all modes
        }
    }

    /**
     * Apply a mapping to CodeMirror Vim
     * Called by KeyMapper when processing mapping commands
     */
    async applyMappingToVim(config: MappingConfig): Promise<void> {
        // Mappings are now applied in batch via applyAllMappingsToVim
        // This method is kept for compatibility but does nothing immediately
        if (this.settings.debugMode) {
            console.log(`[Vimrc] Queued mapping: ${config.from} -> ${config.to}`);
        }
    }

    /**
     * Compare two positions
     * @returns negative if a < b, 0 if equal, positive if a > b
     */
    private comparePos(a: CmPos, b: CmPos): number {
        if (a.line !== b.line) {
            return a.line - b.line;
        }
        return a.ch - b.ch;
    }

    /**
     * Apply an amap to CodeMirror Vim
     * Helper method to bind a key to an async motion
     */
    private applyAmapToVim(
        vimApi: VimApi, 
        key: string, 
        motionName: string, 
        mode: 'normal' | 'insert' | 'visual' | 'all'
    ): void {
        // For motions, we don't specify context so they work in all modes including operator-pending
        // The mode parameter is kept for future use but motions inherently work across modes
        vimApi.mapCommand(key, 'motion', motionName);

        if (this.settings.debugMode) {
            console.log(`[Vimrc] Applied amap to Vim: ${key} -> ${motionName} (type: motion, requested mode: ${mode})`);
        }
    }

    /**
     * Cleanup all mappings and resources
     * 
     * Requirement 8.4: Cleanup all custom mappings on unload
     */
    private cleanupMappings(): void {
        // Clear mappings from CodeMirror Vim
        const vimApi = this.getVimApi();
        if (vimApi) {
            try {
                // Clear all custom mappings
                vimApi.mapclear();
                if (this.settings.debugMode) {
                    console.log('[Vimrc] Cleared Vim mappings');
                }
            } catch (error) {
                console.error('[Vimrc] Failed to clear Vim mappings:', error);
            }
        }

        // Clear KeyMapper mappings
        this.keyMapper.clearMappings();
        
        // Clear CommandExecutor exmaps
        this.commandExecutor.cleanup();
        
        // Clear parser variables
        this.parser.clearVariables();
        
        // Clear last parse result
        this.lastParseResult = null;

        // Clear pending amaps (but keep registered async motions - they're defined by other plugins)
        this.pendingAmaps.clear();

        if (this.settings.debugMode) {
            console.log('[Vimrc] All mappings cleared');
        }
    }

    /**
     * Get current mappings (for external access)
     */
    getMappings(): MappingConfig[] {
        return this.keyMapper.getMappingConfigs();
    }

    /**
     * Get last parse result (for debugging/testing)
     */
    getLastParseResult(): ParseResult | null {
        return this.lastParseResult;
    }

    /**
     * Get error handler (for debugging/testing)
     */
    getErrorHandler(): ErrorHandler {
        return this.errorHandler;
    }

    /**
     * Get error summary from last load
     */
    getErrorSummary(): string {
        return this.errorHandler.getSummary();
    }

    // ==========================================
    // Public API for other plugins
    // ==========================================

    /**
     * Define a custom motion that can be used with operators (d, c, y, etc.)
     * 
     * Example usage from another plugin:
     * ```typescript
     * const vimrcPlugin = this.app.plugins.plugins['vimrc-support'];
     * vimrcPlugin.defineMotion('nextHeading', (cm, head, motionArgs) => {
     *     // Find next heading and return new cursor position
     *     const doc = cm.getDoc();
     *     let line = head.line + 1;
     *     while (line < doc.lineCount()) {
     *         if (doc.getLine(line).startsWith('#')) {
     *             return { line, ch: 0 };
     *         }
     *         line++;
     *     }
     *     return head; // No heading found, stay in place
     * });
     * // Then map a key to this motion
     * vimrcPlugin.mapMotion('gh', 'nextHeading');
     * ```
     * 
     * @param name - Unique name for the motion
     * @param callback - Function that calculates the new cursor position
     * @returns true if successful, false if Vim API not available
     */
    defineMotion(name: string, callback: MotionCallback): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot define motion: Vim API not available');
            return false;
        }

        try {
            vimApi.defineMotion(name, callback);
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Defined motion: ${name}`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to define motion ${name}:`, error);
            return false;
        }
    }

    /**
     * Map a key sequence to a defined motion
     * 
     * @param keys - Key sequence (e.g., 'gh', '<C-n>')
     * @param motionName - Name of the motion (must be defined first)
     * @param args - Optional motion arguments
     * @returns true if successful
     */
    mapMotion(keys: string, motionName: string, args?: MotionArgs): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot map motion: Vim API not available');
            return false;
        }

        try {
            vimApi.mapCommand(keys, 'motion', motionName, args, { context: 'normal' });
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Mapped motion: ${keys} -> ${motionName}`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to map motion ${keys}:`, error);
            return false;
        }
    }

    /**
     * Define a custom action (command that doesn't take a motion)
     * 
     * Example usage:
     * ```typescript
     * vimrcPlugin.defineAction('toggleSidebar', (cm) => {
     *     this.app.commands.executeCommandById('app:toggle-left-sidebar');
     * });
     * vimrcPlugin.mapAction('<C-b>', 'toggleSidebar');
     * ```
     * 
     * @param name - Unique name for the action
     * @param callback - Function to execute
     * @returns true if successful
     */
    defineAction(name: string, callback: ActionCallback): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot define action: Vim API not available');
            return false;
        }

        try {
            vimApi.defineAction(name, callback);
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Defined action: ${name}`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to define action ${name}:`, error);
            return false;
        }
    }

    /**
     * Map a key sequence to a defined action
     * 
     * @param keys - Key sequence
     * @param actionName - Name of the action
     * @param context - Mode context ('normal', 'visual', 'insert')
     * @returns true if successful
     */
    mapAction(keys: string, actionName: string, context: 'normal' | 'visual' | 'insert' = 'normal'): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot map action: Vim API not available');
            return false;
        }

        try {
            vimApi.mapCommand(keys, 'action', actionName, undefined, { context });
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Mapped action: ${keys} -> ${actionName} (${context})`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to map action ${keys}:`, error);
            return false;
        }
    }

    /**
     * Define a custom operator (command that takes a motion, like d, c, y)
     * 
     * Example usage:
     * ```typescript
     * vimrcPlugin.defineOperator('surround', (cm, operatorArgs, ranges) => {
     *     // Surround the selected text with brackets
     *     const doc = cm.getDoc();
     *     for (const range of ranges) {
     *         const text = doc.getRange(range.anchor, range.head);
     *         doc.replaceRange(`[${text}]`, range.anchor, range.head);
     *     }
     * });
     * vimrcPlugin.mapOperator('gs', 'surround');
     * // Now you can use: gsiw to surround a word, gs$ to surround to end of line, etc.
     * ```
     * 
     * @param name - Unique name for the operator
     * @param callback - Function to execute on the selected range
     * @returns true if successful
     */
    defineOperator(name: string, callback: OperatorCallback): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot define operator: Vim API not available');
            return false;
        }

        try {
            vimApi.defineOperator(name, callback);
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Defined operator: ${name}`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to define operator ${name}:`, error);
            return false;
        }
    }

    /**
     * Map a key sequence to a defined operator
     * 
     * @param keys - Key sequence
     * @param operatorName - Name of the operator
     * @returns true if successful
     */
    mapOperator(keys: string, operatorName: string): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot map operator: Vim API not available');
            return false;
        }

        try {
            vimApi.mapCommand(keys, 'operator', operatorName, undefined, { context: 'normal' });
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Mapped operator: ${keys} -> ${operatorName}`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to map operator ${keys}:`, error);
            return false;
        }
    }

    /**
     * Define an ex command (command that can be called with :name)
     * 
     * @param name - Command name
     * @param callback - Function to execute
     * @returns true if successful
     */
    defineExCommand(name: string, callback: (cm: any, params: any) => void): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot define ex command: Vim API not available');
            return false;
        }

        try {
            vimApi.defineEx(name, name, callback);
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Defined ex command: ${name}`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to define ex command ${name}:`, error);
            return false;
        }
    }

    /**
     * Get the raw CodeMirror Vim API for advanced usage
     * 
     * @returns VimApi or null if not available
     */
    getVimApiPublic(): VimApi | null {
        return this.getVimApi();
    }

    /**
     * Define an async jump action for interactive cursor movement
     * 
     * This is designed for plugins like EasyMotion/flash-jump that need to:
     * 1. Show visual hints
     * 2. Wait for user input
     * 3. Jump to the selected position
     * 
     * Unlike regular motions, this supports async operations and can work
     * with operators (d, c, y) by using visual selection.
     * 
     * Example usage:
     * ```typescript
     * const vimrcPlugin = this.app.plugins.plugins['vimrc-support'];
     * 
     * vimrcPlugin.defineAsyncMotion('flashJump', async (cm, vim) => {
     *     // Show hints and wait for user selection
     *     const targetPos = await showHintsAndWaitForSelection(cm);
     *     
     *     if (targetPos) {
     *         return targetPos; // Return the position to jump to
     *     }
     *     return null; // Return null to cancel (stay in place)
     * });
     * 
     * // Map to a key
     * vimrcPlugin.mapAsyncMotion('s', 'flashJump');
     * ```
     * 
     * @param name - Unique name for the async motion
     * @param callback - Async function that returns the target position or null
     * @returns true if successful
     */
    defineAsyncMotion(
        name: string, 
        callback: (cm: any, vim: any, operatorPending: boolean) => Promise<CmPos | null>
    ): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot define async motion: Vim API not available');
            return false;
        }

        try {
            // Store the callback for later use
            const asyncMotionCallback = callback;
            
            // Define a motion that captures operator state and triggers async flow
            vimApi.defineMotion(name, (cm: any, head: CmPos, motionArgs: MotionArgs, vim: any) => {
                // Capture the pending operator info from lastEditInputState
                // When motion is called, Vim has already moved inputState to lastEditInputState
                const editState = vim.lastEditInputState;
                
                // Only consider operator pending if the motion in lastEditInputState matches current motion
                // This prevents using stale operator state from previous commands
                const isCurrentMotion = editState?.motion === name;
                const pendingOperator = isCurrentMotion ? editState?.operator : null;
                const pendingOperatorArgs = isCurrentMotion ? editState?.operatorArgs : null;
                const isOperatorPending = pendingOperator != null;
                const isVisualMode = vim.visualMode === true;
                const visualAnchor = isVisualMode ? cm.getCursor('anchor') : null;
                
                console.log(`[Vimrc] Async motion '${name}' triggered:`, {
                    isOperatorPending,
                    pendingOperator,
                    isVisualMode,
                    isCurrentMotion,
                    editStateMotion: editState?.motion,
                    head
                });
                
                // Execute the async callback
                asyncMotionCallback(cm, vim, isOperatorPending).then((targetPos) => {
                    if (targetPos) {
                        const startPos = head; // Position when motion was triggered
                        
                        console.log(`[Vimrc] Async motion '${name}' completed:`, {
                            startPos,
                            targetPos,
                            isOperatorPending,
                            pendingOperator,
                            isVisualMode
                        });
                        
                        if (isVisualMode && visualAnchor) {
                            // In visual mode, extend selection to target
                            cm.setSelection(visualAnchor, targetPos);
                        } else if (isOperatorPending && pendingOperator) {
                            // Operator was pending, manually execute the operation
                            // We need to select the range and then simulate the operator
                            cm.operation(() => {
                                // Determine the range (handle forward and backward motions)
                                const from = this.comparePos(startPos, targetPos) < 0 ? startPos : targetPos;
                                const to = this.comparePos(startPos, targetPos) < 0 ? targetPos : startPos;
                                
                                if (pendingOperator === 'delete' || pendingOperator === 'd') {
                                    // Delete operation - also copies to register (like Vim)
                                    const text = cm.getRange(from, to);
                                    const linewise = from.ch === 0 && to.ch === 0;
                                    
                                    // Copy to register before deleting
                                    // @ts-ignore
                                    const CodeMirrorVim = (window as any).CodeMirrorAdapter?.Vim;
                                    if (CodeMirrorVim?.getRegisterController) {
                                        const registerController = CodeMirrorVim.getRegisterController();
                                        const registerName = pendingOperatorArgs?.registerName || '"';
                                        registerController.pushText(registerName, 'delete', text, linewise, false);
                                    }
                                    
                                    // Delete the text
                                    cm.replaceRange('', from, to);
                                    cm.setCursor(from);
                                } else if (pendingOperator === 'yank' || pendingOperator === 'y') {
                                    // Yank operation - copy to Vim register
                                    const text = cm.getRange(from, to);
                                    const linewise = from.ch === 0 && to.ch === 0;
                                    
                                    // Access Vim's register controller via CodeMirrorAdapter.Vim.getRegisterController()
                                    // @ts-ignore
                                    const CodeMirrorVim = (window as any).CodeMirrorAdapter?.Vim;
                                    
                                    if (CodeMirrorVim?.getRegisterController) {
                                        const registerController = CodeMirrorVim.getRegisterController();
                                        // Get register name from operatorArgs or use default '"'
                                        const registerName = pendingOperatorArgs?.registerName || '"';
                                        
                                        // pushText(registerName, operator, text, linewise, blockwise)
                                        registerController.pushText(
                                            registerName,
                                            'yank',
                                            text,
                                            linewise,
                                            false // blockwise
                                        );
                                        console.log(`[Vimrc] Yanked text to register '${registerName}':`, text.substring(0, 50));
                                    } else {
                                        console.warn('[Vimrc] Could not access Vim register controller');
                                    }
                                    
                                    // Also copy to system clipboard
                                    navigator.clipboard?.writeText(text);
                                    cm.setCursor(from);
                                } else if (pendingOperator === 'change' || pendingOperator === 'c') {
                                    // Change operation - delete and enter insert mode
                                    cm.replaceRange('', from, to);
                                    cm.setCursor(from);
                                    // Enter insert mode
                                    // @ts-ignore
                                    const CodeMirrorVim = (window as any).CodeMirrorAdapter?.Vim;
                                    if (CodeMirrorVim?.handleKey) {
                                        CodeMirrorVim.handleKey(cm, 'i', 'mapping');
                                    }
                                } else {
                                    // Unknown operator, just select the range
                                    console.warn(`[Vimrc] Unknown operator: ${pendingOperator}, selecting range`);
                                    cm.setSelection(from, to);
                                }
                            });
                        } else {
                            // No operator pending, just move the cursor
                            cm.setCursor(targetPos);
                        }
                    }
                    // If null, do nothing (cancelled)
                }).catch((error) => {
                    console.error(`[Vimrc] Async motion ${name} failed:`, error);
                });
                
                // Return current position immediately (motion is async, actual movement happens in callback)
                return head;
            });

            // Track this async motion as registered
            this.registeredAsyncMotions.add(name);

            if (this.settings.debugMode) {
                console.log(`[Vimrc] Defined async motion: ${name}`);
            }

            // Apply any pending amaps for this action
            const pendingMaps = this.pendingAmaps.get(name);
            if (pendingMaps && pendingMaps.length > 0) {
                for (const pending of pendingMaps) {
                    try {
                        this.applyAmapToVim(vimApi, pending.key, name, pending.mode);
                        if (this.settings.debugMode) {
                            console.log(`[Vimrc] Applied deferred amap: ${pending.key} -> ${name}`);
                        }
                    } catch (error) {
                        console.error(`[Vimrc] Failed to apply deferred amap ${pending.key}:`, error);
                    }
                }
                // Clear pending maps for this action
                this.pendingAmaps.delete(name);
            }

            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to define async motion ${name}:`, error);
            return false;
        }
    }

    /**
     * Map a key sequence to an async motion
     * 
     * @param keys - Key sequence
     * @param motionName - Name of the async motion
     * @param contexts - Mode contexts to apply (default: ['normal', 'visual'])
     * @returns true if successful
     */
    mapAsyncMotion(
        keys: string, 
        motionName: string, 
        contexts: ('normal' | 'visual' | 'insert')[] = ['normal', 'visual']
    ): boolean {
        const vimApi = this.getVimApi();
        if (!vimApi) {
            console.warn('[Vimrc] Cannot map async motion: Vim API not available');
            return false;
        }

        try {
            for (const context of contexts) {
                vimApi.mapCommand(keys, 'action', motionName, undefined, { context });
            }
            if (this.settings.debugMode) {
                console.log(`[Vimrc] Mapped async motion: ${keys} -> ${motionName} (${contexts.join(', ')})`);
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to map async motion ${keys}:`, error);
            return false;
        }
    }

    /**
     * Get the current editor's CodeMirror instance
     * Useful for plugins that need direct access to the editor
     * 
     * @returns CodeMirror instance or null
     */
    getActiveCodeMirror(): any {
        // @ts-ignore
        return this.app.workspace?.activeEditor?.editor?.cm?.cm || null;
    }

    /**
     * Execute a Vim command string (like :normal dd)
     * 
     * @param command - Vim command to execute
     * @returns true if successful
     */
    executeVimCommand(command: string): boolean {
        const cm = this.getActiveCodeMirror();
        const vimApi = this.getVimApi();
        
        if (!cm || !vimApi) {
            console.warn('[Vimrc] Cannot execute Vim command: editor not available');
            return false;
        }

        try {
            // @ts-ignore - CodeMirror Vim has this method
            if (typeof cm.openDialog === 'function') {
                // Execute as ex command
                const match = command.match(/^:?(.+)$/);
                if (match) {
                    // @ts-ignore
                    CodeMirror.Vim.handleEx(cm, match[1]);
                }
            }
            return true;
        } catch (error) {
            console.error(`[Vimrc] Failed to execute Vim command:`, error);
            return false;
        }
    }
}
