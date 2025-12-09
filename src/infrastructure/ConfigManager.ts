/**
 * ConfigManager - Centralized Configuration Management
 *
 * Provides reactive configuration management with:
 * - Synchronous settings access (Requirement 6.2)
 * - Settings change events (Requirement 6.1)
 * - Settings validation against schema (Requirement 6.4)
 * - Default values for missing settings (Requirement 6.5)
 *
 * @module infrastructure/ConfigManager
 */

import type { IEventBus } from '../types/services';
import type { IConfigManager, VimrcSettings } from '../types/settings';
import { DEFAULT_SETTINGS, normalizeSettings, validateSettings } from '../types/settings';
import { EventType } from '../types/events';

/**
 * Plugin interface for settings persistence
 * This abstracts the Obsidian plugin's loadData/saveData methods
 */
export interface ISettingsPersistence {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

/**
 * ConfigManager implementation
 *
 * Manages plugin settings with validation, defaults, and change notifications.
 * Settings are loaded once at initialization and cached for synchronous access.
 */
export class ConfigManager implements IConfigManager {
  /**
   * Current settings (cached for synchronous access)
   */
  private settings: VimrcSettings;

  /**
   * EventBus for emitting settings change events
   */
  private eventBus: IEventBus;

  /**
   * Plugin instance for persistence
   */
  private persistence: ISettingsPersistence;

  /**
   * Manual change listeners (for components that don't use EventBus)
   */
  private changeListeners: Set<(settings: VimrcSettings) => void>;

  /**
   * Whether settings have been initialized
   */
  private initialized: boolean;

  /**
   * Create a new ConfigManager
   *
   * @param eventBus - EventBus for emitting change events
   * @param persistence - Plugin instance for loading/saving settings
   */
  constructor(eventBus: IEventBus, persistence: ISettingsPersistence) {
    this.eventBus = eventBus;
    this.persistence = persistence;
    this.settings = { ...DEFAULT_SETTINGS };
    this.changeListeners = new Set();
    this.initialized = false;
  }

  /**
   * Initialize the ConfigManager by loading settings from persistence
   * This should be called before other components initialize (Requirement 6.3)
   *
   * @returns Promise that resolves when settings are loaded
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const data = await this.persistence.loadData();

      // Validate and normalize loaded data (Requirements 6.4, 6.5)
      if (data && typeof data === 'object') {
        const errors = validateSettings(data);
        if (errors.length > 0) {
          console.warn('[ConfigManager] Settings validation warnings:', errors);
        }
        this.settings = normalizeSettings(data as Partial<VimrcSettings>);
      } else {
        // No saved data, use defaults
        this.settings = { ...DEFAULT_SETTINGS };
      }

      this.initialized = true;
    } catch (error) {
      console.error('[ConfigManager] Failed to load settings:', error);
      // Fall back to defaults on error
      this.settings = { ...DEFAULT_SETTINGS };
      this.initialized = true;
    }
  }

  /**
   * Get current settings synchronously (Requirement 6.2)
   *
   * @returns Current settings object (copy to prevent mutation)
   */
  getSettings(): VimrcSettings {
    return { ...this.settings };
  }

  /**
   * Update settings with partial values (Requirement 6.1)
   *
   * @param partial - Partial settings to merge with current settings
   * @returns Promise that resolves when settings are saved
   */
  async updateSettings(partial: Partial<VimrcSettings>): Promise<void> {
    // Store previous settings for event
    const previous = { ...this.settings };

    // Validate the partial update
    const errors = validateSettings({ ...this.settings, ...partial });
    if (errors.length > 0) {
      console.warn('[ConfigManager] Settings validation warnings:', errors);
    }

    // Merge and normalize (Requirement 6.5)
    const merged = { ...this.settings, ...partial };
    this.settings = normalizeSettings(merged);

    // Persist to storage
    await this.persistence.saveData(this.settings);

    // Emit settings changed event (Requirement 6.1)
    this.eventBus.emit(EventType.SETTINGS_CHANGED, {
      settings: { ...this.settings },
      previous,
    });

    // Notify manual listeners
    this.notifyListeners();
  }

  /**
   * Reset settings to defaults (Requirement 6.5)
   *
   * @returns Promise that resolves when settings are saved
   */
  async resetToDefaults(): Promise<void> {
    const previous = { ...this.settings };

    this.settings = { ...DEFAULT_SETTINGS };

    // Persist to storage
    await this.persistence.saveData(this.settings);

    // Emit settings changed event
    this.eventBus.emit(EventType.SETTINGS_CHANGED, {
      settings: { ...this.settings },
      previous,
    });

    // Notify manual listeners
    this.notifyListeners();
  }

  /**
   * Subscribe to settings changes
   * This is an alternative to using EventBus for components that prefer callbacks
   *
   * @param handler - Function to call when settings change
   * @returns Unsubscribe function
   */
  onSettingsChange(handler: (settings: VimrcSettings) => void): () => void {
    this.changeListeners.add(handler);

    return () => {
      this.changeListeners.delete(handler);
    };
  }

  /**
   * Notify all manual change listeners
   */
  private notifyListeners(): void {
    const currentSettings = { ...this.settings };
    for (const listener of this.changeListeners) {
      try {
        listener(currentSettings);
      } catch (error) {
        console.error('[ConfigManager] Error in settings change listener:', error);
      }
    }
  }

  /**
   * Check if settings have been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
