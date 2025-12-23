/**
 * VimrcLoader - Vimrc File Loading and Processing Coordinator
 *
 * Coordinates file detection, parsing, and command execution for vimrc files.
 * Implements the IVimrcLoader interface for the new architecture.
 *
 * @module services/VimrcLoader
 *
 * Requirements:
 * - 1.2: Delegate all Vim API interactions to VimAdapter
 * - 1.3: Delegate file watching to FileWatcher service
 */

import type { App } from 'obsidian';
import type {
  IEventBus,
  IVimrcLoader,
  IVimrcParser,
  IVimAdapter,
  LoadResult,
  IErrorHandler,
} from '../types/services';
import type { IConfigManager } from '../types/settings';
import type { ICommandRegistry, ParseResult, IObmapProvider, IExmapProvider, ObmapDefinition, ExmapDefinition } from '../types/commands';
import type { IMappingApplier, IMappingStore } from '../types/mappings';
import { VimMode } from '../types/mappings';
import { EventType } from '../types/events';
import { CommandType } from '../types/commands';
import { getLogger } from './Logger';

/**
 * File adapter interface for reading files
 * Abstracts Obsidian's vault adapter for testability
 */
export interface IFileAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

/**
 * VimrcLoader implementation
 *
 * Coordinates the loading and processing of vimrc configuration files.
 * Handles file detection, parsing, command execution, and mapping application.
 */
const log = getLogger('loader');

export class VimrcLoader implements IVimrcLoader {
  /**
   * EventBus for emitting loading events
   */
  private eventBus: IEventBus;

  /**
   * Parser for vimrc content
   */
  private parser: IVimrcParser;

  /**
   * Command registry for routing parsed commands
   */
  private commandRegistry: ICommandRegistry;

  /**
   * Mapping applier for applying mappings to Vim
   */
  private mappingApplier: IMappingApplier;

  /**
   * Mapping store for tracking mappings
   */
  private mappingStore: IMappingStore;

  /**
   * Config manager for accessing settings
   */
  private configManager: IConfigManager;

  /**
   * Error handler for error reporting
   */
  private errorHandler: IErrorHandler;

  /**
   * File adapter for reading files
   */
  private fileAdapter: IFileAdapter;

  /**
   * Vim adapter for applying obmap/exmap/amap
   */
  private vimAdapter: IVimAdapter | null = null;

  /**
   * Obmap provider for getting obmap definitions (decoupled from ObmapHandler)
   */
  private obmapProvider: IObmapProvider | null = null;

  /**
   * Exmap provider for getting exmap definitions (decoupled from ExmapHandler)
   */
  private exmapProvider: IExmapProvider | null = null;

  /**
   * Track applied Obmap/Exmap definitions for cleanup
   */
  private appliedObmaps: Array<{ key: string; mode: VimMode }> = [];
  private appliedExmaps: string[] = [];

  /**
   * Last load result
   */
  private lastResult: LoadResult | null = null;

  /**
   * Create a new VimrcLoader
   *
   * @param eventBus - EventBus for emitting events
   * @param parser - Parser for vimrc content
   * @param commandRegistry - Registry for routing commands
   * @param mappingApplier - Applier for applying mappings
   * @param mappingStore - Store for tracking mappings
   * @param configManager - Manager for accessing settings
   * @param errorHandler - Handler for error reporting
   * @param fileAdapter - Adapter for file operations
   */
  constructor(
    eventBus: IEventBus,
    parser: IVimrcParser,
    commandRegistry: ICommandRegistry,
    mappingApplier: IMappingApplier,
    mappingStore: IMappingStore,
    configManager: IConfigManager,
    errorHandler: IErrorHandler,
    fileAdapter: IFileAdapter
  ) {
    this.eventBus = eventBus;
    this.parser = parser;
    this.commandRegistry = commandRegistry;
    this.mappingApplier = mappingApplier;
    this.mappingStore = mappingStore;
    this.configManager = configManager;
    this.errorHandler = errorHandler;
    this.fileAdapter = fileAdapter;
  }

  /**
   * Set the VimAdapter for applying obmap/exmap/amap
   */
  setVimAdapter(vimAdapter: IVimAdapter): void {
    this.vimAdapter = vimAdapter;
  }

  /**
   * Set provider references for getting definitions
   * Uses interfaces for decoupling from concrete handler implementations
   */
  setProviders(obmapProvider: IObmapProvider, exmapProvider: IExmapProvider): void {
    this.obmapProvider = obmapProvider;
    this.exmapProvider = exmapProvider;
  }

  /**
   * Load and process the vimrc file
   *
   * Detects the vimrc file, parses it, executes commands, and applies mappings.
   *
   * @returns Promise resolving to the load result
   */
  async load(): Promise<LoadResult> {
    const endTimer = log.time('load');
    const result: LoadResult = {
      success: false,
      path: null,
      mappingCount: 0,
      errors: [],
      warnings: [],
    };

    try {
      // Detect vimrc file path
      const vimrcPath = await this.detectVimrcFile();

      if (!vimrcPath) {
        // No vimrc file found - this is not an error
        log.debug('No vimrc file found');
        result.success = true;
        this.lastResult = result;
        endTimer();
        return result;
      }

      result.path = vimrcPath;
      log.info(`Loading vimrc from: ${vimrcPath}`);

      // Emit loading event
      this.eventBus.emit(EventType.VIMRC_LOADING, { path: vimrcPath });

      // Read file content
      const content = await this.readVimrcFile(vimrcPath);

      if (content === null) {
        log.error(`Failed to read file: ${vimrcPath}`);
        result.errors.push({
          lineNumber: 0,
          message: `Failed to read file: ${vimrcPath}`,
          raw: '',
        });
        this.lastResult = result;
        endTimer();
        return result;
      }

      log.debug(`File content length: ${content.length} chars`);

      // Parse vimrc content
      const parseResult = this.parser.parse(content);
      log.debug(`Parsed ${parseResult.commands.length} commands`);

      // Copy errors and warnings
      result.errors = [...parseResult.errors];
      result.warnings = [...parseResult.warnings];

      if (parseResult.errors.length > 0) {
        log.warn(`Parse errors: ${parseResult.errors.length}`);
      }

      // Execute commands through registry
      await this.executeCommands(parseResult);

      // Apply mappings to Vim
      await this.mappingApplier.applyAll();

      // Apply obmap, exmap, and amap to Vim
      await this.applyAllToVim();

      // Get mapping count from store
      result.mappingCount = this.mappingStore.count();
      result.success = true;

      log.info(`Loaded ${result.mappingCount} mappings successfully`);

      // Emit loaded event
      this.eventBus.emit(EventType.VIMRC_LOADED, result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Load failed:', err.message);
      result.errors.push({
        lineNumber: 0,
        message: err.message,
        raw: '',
      });

      // Report error through error handler
      this.errorHandler.handle(err, 'VimrcLoader.load');

      // Emit error event
      this.eventBus.emit(EventType.VIMRC_ERROR, {
        error: err,
        path: result.path || '',
      });
    }

    this.lastResult = result;
    endTimer();
    return result;
  }

  /**
   * Reload the vimrc file
   *
   * Clears existing mappings and reloads the configuration.
   *
   * @returns Promise resolving to the load result
   */
  async reload(): Promise<LoadResult> {
    log.info('Reloading vimrc...');

    // Unapply all existing mappings
    await this.mappingApplier.unapplyAll();
    this.mappingStore.clear();

    // Clear obmap/exmap registrations before reloading
    this.clearAppliedObmaps();
    this.clearAppliedExmaps();
    this.resetProviders();

    // Load fresh configuration
    return this.load();
  }

  async cleanup(): Promise<void> {
    await this.mappingApplier.unapplyAll();
    this.mappingStore.clear();
    this.clearAppliedObmaps();
    this.clearAppliedExmaps();
    this.resetProviders();
  }

  /**
   * Apply obmap and exmap definitions to Vim
   */
  private async applyAllToVim(): Promise<void> {
    if (!this.vimAdapter) {
      log.warn('VimAdapter not set, cannot apply obmap/exmap');
      return;
    }

    // Apply obmaps
    if (this.obmapProvider) {
      const obmaps = this.obmapProvider.getObmapDefinitions();
      log.debug(`Applying ${obmaps.length} obmaps`);
      for (let i = 0; i < obmaps.length; i++) {
        const obmap = obmaps[i];
        this.applyObmapToVim(obmap, i);
      }
    }

    // Apply exmaps
    if (this.exmapProvider) {
      const exmaps = this.exmapProvider.getExmapDefinitions();
      log.debug(`Applying ${exmaps.length} exmaps`);
      for (const exmap of exmaps) {
        this.applyExmapToVim(exmap);
      }
    }
  }

  /**
   * Apply a single obmap to Vim
   */
  private applyObmapToVim(obmap: ObmapDefinition, index: number): void {
    if (!this.vimAdapter || !this.obmapProvider) return;

    try {
      const actionName = `obmap_${index}`;
      const provider = this.obmapProvider;
      log.debug(`Applying obmap: ${obmap.key} -> ${obmap.commandId} (${obmap.mode})`);

      // Define action that executes the Obsidian command
      this.vimAdapter.defineAction(actionName, () => {
        provider.executeObsidianCommand(obmap.commandId);
      });

      // Map key to action based on mode
      if (obmap.mode === 'insert') {
        this.vimAdapter.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'insert' });
        this.appliedObmaps.push({ key: obmap.key, mode: VimMode.INSERT });
      } else if (obmap.mode === 'all') {
        this.vimAdapter.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'normal' });
        this.vimAdapter.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'visual' });
        this.vimAdapter.mapCommand(obmap.key, 'action', actionName, undefined, { context: 'insert' });
        this.appliedObmaps.push({ key: obmap.key, mode: VimMode.NORMAL });
        this.appliedObmaps.push({ key: obmap.key, mode: VimMode.VISUAL });
        this.appliedObmaps.push({ key: obmap.key, mode: VimMode.INSERT });
      } else {
        this.vimAdapter.mapCommand(obmap.key, 'action', actionName, undefined, { context: obmap.mode });
        const mode = obmap.mode === 'normal' ? VimMode.NORMAL : VimMode.VISUAL;
        this.appliedObmaps.push({ key: obmap.key, mode });
      }
    } catch (error) {
      log.error(`Failed to apply obmap ${obmap.key}:`, error);
    }
  }

  /**
   * Apply a single exmap to Vim
   */
  private applyExmapToVim(exmap: ExmapDefinition): void {
    if (!this.vimAdapter || !this.exmapProvider) return;

    try {
      const provider = this.exmapProvider;
      log.debug(`Applying exmap: :${exmap.name} -> ${exmap.commandId}`);

      // Define ex command
      this.vimAdapter.defineEx(exmap.name, exmap.name, () => {
        provider.executeObsidianCommand(exmap.commandId);
      });
      this.appliedExmaps.push(exmap.name);
    } catch (error) {
      log.error(`Failed to apply exmap ${exmap.name}:`, error);
    }
  }

  private clearAppliedObmaps(): void {
    if (!this.vimAdapter || this.appliedObmaps.length === 0) {
      this.appliedObmaps = [];
      return;
    }

    for (const obmap of this.appliedObmaps) {
      this.vimAdapter.unmap(obmap.key, obmap.mode);
    }

    this.appliedObmaps = [];
  }

  private clearAppliedExmaps(): void {
    if (!this.vimAdapter || this.appliedExmaps.length === 0) {
      this.appliedExmaps = [];
      return;
    }

    for (const exmapName of this.appliedExmaps) {
      this.vimAdapter.defineEx(exmapName, exmapName, () => {});
    }

    this.appliedExmaps = [];
  }

  private resetProviders(): void {
    const obmapProvider = this.obmapProvider as unknown as { cleanup?: () => void } | null;
    if (obmapProvider?.cleanup) {
      obmapProvider.cleanup();
    }

    const exmapProvider = this.exmapProvider as unknown as { cleanup?: () => void } | null;
    if (exmapProvider?.cleanup) {
      exmapProvider.cleanup();
    }
  }

  /**
   * Get the last load result
   *
   * @returns The last load result, or null if never loaded
   */
  getLastResult(): LoadResult | null {
    return this.lastResult;
  }

  /**
   * Detect which vimrc file to load
   *
   * Priority: custom path > .obsidian.vimrc > .vimrc
   *
   * @returns The path to the vimrc file, or null if not found
   */
  private async detectVimrcFile(): Promise<string | null> {
    const settings = this.configManager.getSettings();

    // Check custom path first if specified and different from default
    if (settings.vimrcPath && settings.vimrcPath !== '.obsidian.vimrc') {
      const customExists = await this.fileAdapter.exists(settings.vimrcPath);
      if (customExists) {
        return settings.vimrcPath;
      }
    }

    // Check .obsidian.vimrc (priority)
    const obsidianVimrcExists = await this.fileAdapter.exists('.obsidian.vimrc');
    if (obsidianVimrcExists) {
      return '.obsidian.vimrc';
    }

    // Fall back to .vimrc
    const vimrcExists = await this.fileAdapter.exists('.vimrc');
    if (vimrcExists) {
      return '.vimrc';
    }

    return null;
  }

  /**
   * Read vimrc file content
   *
   * @param path - Path to the vimrc file
   * @returns File content, or null if read failed
   */
  private async readVimrcFile(path: string): Promise<string | null> {
    try {
      const exists = await this.fileAdapter.exists(path);
      if (!exists) {
        return null;
      }

      return await this.fileAdapter.read(path);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handle(err, `VimrcLoader.readVimrcFile: ${path}`);
      return null;
    }
  }

  /**
   * Execute parsed commands through the command registry
   *
   * @param parseResult - The parse result containing commands
   */
  private async executeCommands(parseResult: ParseResult): Promise<void> {
    for (const command of parseResult.commands) {
      // Skip unknown commands (they generate warnings but shouldn't be executed)
      if (command.type === CommandType.UNKNOWN) {
        continue;
      }

      // Skip let commands (already processed by parser for variable substitution)
      if (command.type === CommandType.LET) {
        continue;
      }

      // Skip comment commands
      if (command.type === CommandType.COMMENT) {
        continue;
      }

      try {
        await this.commandRegistry.route(command);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.errorHandler.handle(err, `VimrcLoader.executeCommands: ${command.type}`);
      }
    }
  }
}

/**
 * Create a file adapter from Obsidian's App
 *
 * @param app - Obsidian App instance
 * @returns File adapter implementation
 */
export function createFileAdapter(app: App): IFileAdapter {
  return {
    exists: (path: string) => app.vault.adapter.exists(path),
    read: (path: string) => app.vault.adapter.read(path),
  };
}
