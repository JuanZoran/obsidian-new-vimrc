/**
 * VimrcPlugin - Lightweight Plugin Entry Point
 *
 * Handles only lifecycle management and service initialization.
 * All functionality is delegated to services.
 *
 * Requirements: 1.1-1.5 (Plugin lifecycle, delegation, cleanup, <200 lines)
 */

import { Plugin, TAbstractFile, Notice } from 'obsidian';
import {
  ServiceContainer, EventBus, ConfigManager, EnhancedErrorHandler,
  VimAdapter, VimrcLoader, VimrcParser, MappingStore, MappingApplier,
  CommandRegistry, SettingsTab, createFileAdapter, PluginApi, Logger, getLogger,
  VimModeStatusBar,
} from './src';
import { ServiceTokens } from './src/types/services';
import type { VimrcSettings } from './src/types/settings';
import type { MotionCallback, ActionCallback } from './src/services/PluginApi';
import { MappingHandler } from './src/handlers/MappingHandler';
import { ObmapHandler } from './src/handlers/ObmapHandler';
import { ExmapHandler } from './src/handlers/ExmapHandler';
import { LetHandler } from './src/handlers/LetHandler';

export default class VimrcPlugin extends Plugin {
  private container!: ServiceContainer;
  private pluginApi!: PluginApi;
  private vimModeStatusBar: VimModeStatusBar | null = null;
  private fileWatcherRegistered = false;
  private debounceTimer: NodeJS.Timeout | null = null;

  async onload(): Promise<void> {
    await this.initializeServices();
    const log = getLogger('plugin');
    log.info('Loading plugin...');

    const configManager = this.container.resolve(ServiceTokens.ConfigManager);
    const loader = this.container.resolve(ServiceTokens.VimrcLoader);
    this.addSettingTab(new SettingsTab(this.app, this, {
      configManager,
      onReload: () => loader.reload(),
    }));
    this.setupFileWatcher();

    // Initialize Vim mode status bar
    this.vimModeStatusBar = new VimModeStatusBar({
      plugin: this,
      app: this.app,
      configManager,
    });
    this.vimModeStatusBar.initialize();

    this.app.workspace.onLayoutReady(async () => {
      this.reportLoadResults(await loader.load());
    });
    log.info('Plugin loaded');
  }

  onunload(): void {
    const log = getLogger('plugin');
    log.info('Unloading plugin...');
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.vimModeStatusBar) this.vimModeStatusBar.destroy();
    if (this.container) this.container.dispose();
    log.info('Plugin unloaded');
  }

  private async initializeServices(): Promise<void> {
    this.container = new ServiceContainer();

    // Core services
    this.container.registerSingleton(ServiceTokens.EventBus, () => new EventBus());
    this.container.registerSingleton(ServiceTokens.ConfigManager, (c) =>
      new ConfigManager(c.resolve(ServiceTokens.EventBus), this));
    this.container.registerSingleton(ServiceTokens.ErrorHandler, (c) =>
      new EnhancedErrorHandler(c.resolve(ServiceTokens.EventBus)));
    this.container.registerSingleton(ServiceTokens.VimAdapter, (c) =>
      new VimAdapter(c.resolve(ServiceTokens.EventBus)));

    // Stores and appliers
    this.container.registerSingleton(ServiceTokens.MappingStore, (c) =>
      new MappingStore(c.resolve(ServiceTokens.EventBus)));
    this.container.registerSingleton(ServiceTokens.MappingApplier, (c) =>
      new MappingApplier(
        c.resolve(ServiceTokens.MappingStore),
        c.resolve(ServiceTokens.VimAdapter),
        c.resolve(ServiceTokens.EventBus)
      ));

    // Parser
    this.container.registerSingleton(ServiceTokens.VimrcParser, () => new VimrcParser());

    // Create handlers
    const eventBus = this.container.resolve(ServiceTokens.EventBus);
    const errorHandler = this.container.resolve(ServiceTokens.ErrorHandler);
    const mappingStore = this.container.resolve(ServiceTokens.MappingStore);
    const vimAdapter = this.container.resolve(ServiceTokens.VimAdapter);

    const mappingHandler = new MappingHandler({ eventBus, errorHandler, mappingStore });
    const obmapHandler = new ObmapHandler({ eventBus, errorHandler, app: this.app });
    const exmapHandler = new ExmapHandler({ eventBus, errorHandler, app: this.app });

    // Command registry with handlers
    this.container.registerSingleton(ServiceTokens.CommandRegistry, () => {
      const registry = new CommandRegistry(eventBus);
      registry.register(mappingHandler);
      registry.register(obmapHandler);
      registry.register(exmapHandler);
      registry.register(new LetHandler({
        eventBus, errorHandler,
        onLeaderKeyChange: (key) => mappingHandler.setLeaderKey(key),
      }));
      return registry;
    });

    // Loader
    this.container.registerSingleton(ServiceTokens.VimrcLoader, (c) => {
      const loader = new VimrcLoader(
        c.resolve(ServiceTokens.EventBus),
        c.resolve(ServiceTokens.VimrcParser),
        c.resolve(ServiceTokens.CommandRegistry),
        c.resolve(ServiceTokens.MappingApplier),
        c.resolve(ServiceTokens.MappingStore),
        c.resolve(ServiceTokens.ConfigManager),
        c.resolve(ServiceTokens.ErrorHandler),
        createFileAdapter(this.app)
      );
      loader.setVimAdapter(vimAdapter);
      loader.setProviders(obmapHandler, exmapHandler);
      return loader;
    });

    // Initialize ConfigManager
    const configManager = this.container.resolve(ServiceTokens.ConfigManager) as ConfigManager;
    await configManager.initialize();

    // Initialize Logger
    Logger.initialize({
      prefix: 'Vimrc',
      getDebugSettings: () => configManager.getSettings().debug,
    });

    // Initialize PluginApi
    this.pluginApi = new PluginApi(this.app, vimAdapter, () => this.settings);
  }

  private setupFileWatcher(): void {
    if (this.fileWatcherRegistered) return;
    const settings = this.container.resolve(ServiceTokens.ConfigManager).getSettings();

    this.registerEvent(
      this.app.vault.on('modify', (file: TAbstractFile) => {
        const path = file.path;
        if (path === settings.vimrcPath || path === '.vimrc' || path === '.obsidian.vimrc') {
          this.debouncedReload();
        }
      })
    );
    this.fileWatcherRegistered = true;
  }

  private debouncedReload(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const loader = this.container.resolve(ServiceTokens.VimrcLoader);
      this.reportLoadResults(await loader.reload());
    }, 500);
  }

  private reportLoadResults(result: {
    success: boolean; mappingCount: number; path: string | null;
    errors: Array<{ lineNumber: number; message: string }>;
  }): void {
    const log = getLogger('plugin');
    const settings = this.container.resolve(ServiceTokens.ConfigManager).getSettings();
    if (result.path) log.info(`Loaded from ${result.path}: ${result.mappingCount} mapping(s)`);
    for (const error of result.errors) new Notice(`Vimrc error (line ${error.lineNumber}): ${error.message}`);
    if (settings.showLoadNotification && result.success) new Notice(`Vimrc loaded: ${result.mappingCount} mapping(s)`);
  }

  get settings(): VimrcSettings {
    return this.container.resolve(ServiceTokens.ConfigManager).getSettings();
  }

  async saveSettings(): Promise<void> { /* Settings saved through ConfigManager.updateSettings() */ }

  // ==========================================
  // Public API for other plugins (e.g., Flash)
  // ==========================================

  /** Get the CodeMirror Vim API directly */
  getVimApi(): unknown {
    return this.pluginApi.getVimApi();
  }

  /** Define an async motion for plugins like Flash */
  defineMotion(name: string, callback: MotionCallback): boolean {
    return this.pluginApi.defineMotion(name, callback);
  }

  /** Define an action (for normal mode) */
  defineAction(name: string, callback: ActionCallback): boolean {
    return this.pluginApi.defineAction(name, callback);
  }

  /** Map keys to a motion */
  mapMotion(keys: string, motionName: string): boolean {
    return this.pluginApi.mapMotion(keys, motionName);
  }

  /** Map keys to an action */
  mapAction(keys: string, actionName: string, contexts?: string[]): boolean {
    return this.pluginApi.mapAction(keys, actionName, contexts);
  }
}
