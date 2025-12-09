/**
 * SettingsTab - Plugin Settings UI
 *
 * Provides the settings interface for the Vimrc plugin.
 * Uses ConfigManager for all settings access and updates.
 *
 * Requirements: 6.1 (Settings change events through ConfigManager)
 *
 * @module ui/SettingsTab
 */

import { App, Notice, PluginSettingTab, Setting, Plugin } from 'obsidian';
import type { IConfigManager, VimrcSettings, DebugModule } from '../types/settings';
import { DEBUG_MODULE_INFO } from '../types/settings';

/**
 * Reload callback type for triggering vimrc reload
 * Returns void or any result (result is ignored)
 */
export type ReloadCallback = () => Promise<unknown>;

/**
 * Settings tab configuration
 */
export interface SettingsTabConfig {
  /** ConfigManager instance for settings access */
  configManager: IConfigManager;
  /** Optional callback to reload vimrc */
  onReload?: ReloadCallback;
}

/**
 * Settings tab for the Vimrc plugin
 *
 * Uses ConfigManager for all settings operations, ensuring:
 * - Settings changes emit events (Requirement 6.1)
 * - Synchronous settings access (Requirement 6.2)
 * - Proper validation and defaults (Requirements 6.4, 6.5)
 */
export class SettingsTab extends PluginSettingTab {
  private configManager: IConfigManager;
  private onReload?: ReloadCallback;
  private unsubscribe?: () => void;
  private debugModulesContainer: HTMLElement | null = null;

  /**
   * Create a new SettingsTab
   *
   * @param app - Obsidian App instance
   * @param plugin - Plugin instance
   * @param config - Settings tab configuration
   */
  constructor(app: App, plugin: Plugin, config: SettingsTabConfig) {
    super(app, plugin);
    this.configManager = config.configManager;
    this.onReload = config.onReload;
  }

  /**
   * Display the settings tab
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Unsubscribe from previous subscription if exists
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    this.renderHeader(containerEl);
    this.renderSettings(containerEl);
    this.renderActions(containerEl);

    // Note: We don't auto-refresh on settings change anymore to avoid infinite loops
    // The UI controls update their own state through onChange handlers
  }

  /**
   * Clean up when tab is hidden
   */
  hide(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  /**
   * Render the settings header
   */
  private renderHeader(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Vimrc Plugin Settings' });
  }

  /**
   * Render all settings controls
   */
  private renderSettings(containerEl: HTMLElement): void {
    const settings = this.configManager.getSettings();

    // Vimrc file path setting
    new Setting(containerEl)
      .setName('Vimrc file path')
      .setDesc('Path to the vimrc file relative to vault root (default: .obsidian.vimrc)')
      .addText((text) =>
        text
          .setPlaceholder('.obsidian.vimrc')
          .setValue(settings.vimrcPath)
          .onChange(async (value) => {
            await this.updateSetting('vimrcPath', value);
          })
      );

    // Show load notification setting
    new Setting(containerEl)
      .setName('Show load notification')
      .setDesc('Display a notification when vimrc configuration is loaded')
      .addToggle((toggle) =>
        toggle.setValue(settings.showLoadNotification).onChange(async (value) => {
          await this.updateSetting('showLoadNotification', value);
        })
      );
  }

  /**
   * Render action buttons
   */
  private renderActions(containerEl: HTMLElement): void {
    // Reload vimrc button
    new Setting(containerEl)
      .setName('Reload vimrc')
      .setDesc('Immediately reload the configuration file')
      .addButton((button) =>
        button.setButtonText('Reload').onClick(async () => {
          if (this.onReload) {
            await this.onReload();
            new Notice('Vimrc reloaded');
          } else {
            new Notice('Reload not available');
          }
        })
      );

    // Reset to defaults button
    new Setting(containerEl)
      .setName('Reset to defaults')
      .setDesc('Reset all settings to their default values')
      .addButton((button) =>
        button
          .setButtonText('Reset')
          .setWarning()
          .onClick(async () => {
            await this.configManager.resetToDefaults();
            new Notice('Settings reset to defaults');
            this.display(); // Refresh UI
          })
      );

    // Debug section (at the bottom)
    this.renderDebugSection(containerEl);
  }

  /**
   * Render the debug section with collapsible module toggles
   */
  private renderDebugSection(containerEl: HTMLElement): void {
    const settings = this.configManager.getSettings();

    // Debug section header
    containerEl.createEl('h3', { text: 'Debug Options', cls: 'vimrc-debug-header' });

    // Master debug toggle
    new Setting(containerEl)
      .setName('Enable debug mode')
      .setDesc('Enable debug logging to console. Expand to configure individual modules.')
      .addToggle((toggle) =>
        toggle.setValue(settings.debug.enabled).onChange(async (value) => {
          await this.updateDebugEnabled(value);
          this.updateDebugModulesVisibility(value);
        })
      );

    // Container for debug module toggles
    this.debugModulesContainer = containerEl.createDiv({
      cls: 'vimrc-debug-modules',
    });

    // Set initial visibility
    this.updateDebugModulesVisibility(settings.debug.enabled);

    // Render module toggles
    this.renderDebugModules();
  }

  /**
   * Render individual debug module toggles
   */
  private renderDebugModules(): void {
    if (!this.debugModulesContainer) return;

    this.debugModulesContainer.empty();
    const settings = this.configManager.getSettings();

    // Add some visual separation
    this.debugModulesContainer.createEl('div', {
      cls: 'vimrc-debug-modules-desc',
      text: 'Toggle debug output for specific modules:',
    });

    // Create toggle for each module
    const modules = Object.keys(DEBUG_MODULE_INFO) as DebugModule[];
    for (const module of modules) {
      const info = DEBUG_MODULE_INFO[module];
      new Setting(this.debugModulesContainer)
        .setName(info.name)
        .setDesc(info.desc)
        .addToggle((toggle) =>
          toggle.setValue(settings.debug.modules[module]).onChange(async (value) => {
            await this.updateDebugModule(module, value);
          })
        );
    }

    // Quick actions
    new Setting(this.debugModulesContainer)
      .setName('Quick actions')
      .setDesc('Enable or disable all modules at once')
      .addButton((button) =>
        button.setButtonText('Enable All').onClick(async () => {
          await this.setAllDebugModules(true);
        })
      )
      .addButton((button) =>
        button.setButtonText('Disable All').onClick(async () => {
          await this.setAllDebugModules(false);
        })
      );
  }

  /**
   * Update debug modules container visibility
   */
  private updateDebugModulesVisibility(visible: boolean): void {
    if (!this.debugModulesContainer) return;

    if (visible) {
      this.debugModulesContainer.removeClass('vimrc-debug-modules-hidden');
      this.debugModulesContainer.addClass('vimrc-debug-modules-visible');
    } else {
      this.debugModulesContainer.removeClass('vimrc-debug-modules-visible');
      this.debugModulesContainer.addClass('vimrc-debug-modules-hidden');
    }
  }

  /**
   * Update the master debug enabled setting
   */
  private async updateDebugEnabled(enabled: boolean): Promise<void> {
    const settings = this.configManager.getSettings();
    await this.configManager.updateSettings({
      debug: { ...settings.debug, enabled },
      debugMode: enabled, // Keep legacy setting in sync
    });
  }

  /**
   * Update a single debug module setting
   */
  private async updateDebugModule(module: DebugModule, enabled: boolean): Promise<void> {
    const settings = this.configManager.getSettings();
    await this.configManager.updateSettings({
      debug: {
        ...settings.debug,
        modules: { ...settings.debug.modules, [module]: enabled },
      },
    });
  }

  /**
   * Set all debug modules to the same state
   */
  private async setAllDebugModules(enabled: boolean): Promise<void> {
    const settings = this.configManager.getSettings();
    const modules = { ...settings.debug.modules };
    for (const key of Object.keys(modules) as DebugModule[]) {
      modules[key] = enabled;
    }
    await this.configManager.updateSettings({
      debug: { ...settings.debug, modules },
    });
    this.renderDebugModules(); // Refresh toggles
  }

  /**
   * Update a single setting value through ConfigManager
   *
   * @param key - Setting key to update
   * @param value - New value for the setting
   */
  private async updateSetting<K extends keyof VimrcSettings>(
    key: K,
    value: VimrcSettings[K]
  ): Promise<void> {
    await this.configManager.updateSettings({ [key]: value });
  }
}
