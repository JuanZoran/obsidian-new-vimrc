/**
 * Settings-related type definitions
 */

/**
 * Debug module identifiers
 */
export type DebugModule =
  | 'loader'      // VimrcLoader - file loading and parsing
  | 'parser'      // VimrcParser - command parsing
  | 'mapping'     // MappingHandler - key mapping processing
  | 'obmap'       // ObmapHandler - Obsidian command mapping
  | 'exmap'       // ExmapHandler - Ex command mapping
  | 'vimAdapter'  // VimAdapter - CodeMirror Vim API
  | 'eventBus'    // EventBus - event system
  | 'config'      // ConfigManager - settings management
  | 'plugin'      // Main plugin lifecycle
  | 'registry'    // CommandRegistry
  | 'api'         // PluginApi - public API for other plugins
  | 'statusBar';  // VimModeStatusBar - status bar UI

/**
 * Debug settings for individual modules
 */
export interface DebugSettings {
  /** Master debug switch */
  enabled: boolean;
  /** Individual module debug switches */
  modules: Record<DebugModule, boolean>;
}

/**
 * Default debug module states
 */
export const DEFAULT_DEBUG_MODULES: Record<DebugModule, boolean> = {
  loader: true,
  parser: true,
  mapping: true,
  obmap: true,
  exmap: true,
  vimAdapter: true,
  eventBus: false,
  config: false,
  plugin: true,
  registry: true,
  api: true,
  statusBar: false,
};

/**
 * Debug module display names and descriptions
 */
export const DEBUG_MODULE_INFO: Record<DebugModule, { name: string; desc: string }> = {
  loader: { name: 'Loader', desc: 'Vimrc file loading and processing' },
  parser: { name: 'Parser', desc: 'Command parsing and validation' },
  mapping: { name: 'Mapping', desc: 'Key mapping processing (map, nmap, etc.)' },
  obmap: { name: 'Obmap', desc: 'Obsidian command mapping (obmap, nobmap, etc.)' },
  exmap: { name: 'Exmap', desc: 'Ex command mapping (exmap, obcommand)' },
  vimAdapter: { name: 'Vim Adapter', desc: 'CodeMirror Vim API interactions' },
  eventBus: { name: 'Event Bus', desc: 'Internal event system (verbose)' },
  config: { name: 'Config', desc: 'Settings management' },
  plugin: { name: 'Plugin', desc: 'Main plugin lifecycle events' },
  registry: { name: 'Registry', desc: 'Command registry operations' },
  api: { name: 'API', desc: 'Public API for other plugins' },
  statusBar: { name: 'Status Bar', desc: 'Vim mode status bar UI' },
};

/**
 * Plugin settings
 */
export interface VimrcSettings {
  /** Path to the vimrc file relative to vault root */
  vimrcPath: string;
  /** Whether to show notification when vimrc is loaded */
  showLoadNotification: boolean;
  /** Enable debug mode for verbose logging */
  debugMode: boolean;
  /** Debug settings for individual modules */
  debug: DebugSettings;
  /** Whether to show Vim mode in status bar */
  showVimModeInStatusBar: boolean;
}

/**
 * Default debug settings
 */
export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  enabled: false,
  modules: { ...DEFAULT_DEBUG_MODULES },
};

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: VimrcSettings = {
  vimrcPath: '.obsidian.vimrc',
  showLoadNotification: false,
  debugMode: false,
  debug: { ...DEFAULT_DEBUG_SETTINGS },
  showVimModeInStatusBar: true,
};

/**
 * Settings schema for validation
 */
export interface SettingsSchema {
  vimrcPath: {
    type: 'string';
    default: string;
    minLength: 1;
  };
  showLoadNotification: {
    type: 'boolean';
    default: boolean;
  };
  debugMode: {
    type: 'boolean';
    default: boolean;
  };
}

/**
 * Config manager interface
 */
export interface IConfigManager {
  /**
   * Get current settings synchronously
   */
  getSettings(): VimrcSettings;

  /**
   * Update settings with partial values
   */
  updateSettings(partial: Partial<VimrcSettings>): Promise<void>;

  /**
   * Reset settings to defaults
   */
  resetToDefaults(): Promise<void>;

  /**
   * Subscribe to settings changes
   */
  onSettingsChange(handler: (settings: VimrcSettings) => void): () => void;
}

/**
 * Normalize debug settings
 */
function normalizeDebugSettings(debug: Partial<DebugSettings> | undefined): DebugSettings {
  if (!debug || typeof debug !== 'object') {
    return { ...DEFAULT_DEBUG_SETTINGS };
  }

  const modules = { ...DEFAULT_DEBUG_MODULES };
  if (debug.modules && typeof debug.modules === 'object') {
    for (const key of Object.keys(DEFAULT_DEBUG_MODULES) as DebugModule[]) {
      if (typeof debug.modules[key] === 'boolean') {
        modules[key] = debug.modules[key];
      }
    }
  }

  return {
    enabled: typeof debug.enabled === 'boolean' ? debug.enabled : DEFAULT_DEBUG_SETTINGS.enabled,
    modules,
  };
}

/**
 * Validate and normalize settings
 * @param settings Partial or complete settings object
 * @returns Complete, validated settings object
 */
export function normalizeSettings(settings: Partial<VimrcSettings>): VimrcSettings {
  return {
    vimrcPath:
      typeof settings.vimrcPath === 'string' && settings.vimrcPath.length > 0
        ? settings.vimrcPath
        : DEFAULT_SETTINGS.vimrcPath,
    showLoadNotification:
      typeof settings.showLoadNotification === 'boolean'
        ? settings.showLoadNotification
        : DEFAULT_SETTINGS.showLoadNotification,
    debugMode:
      typeof settings.debugMode === 'boolean'
        ? settings.debugMode
        : DEFAULT_SETTINGS.debugMode,
    debug: normalizeDebugSettings(settings.debug),
    showVimModeInStatusBar:
      typeof settings.showVimModeInStatusBar === 'boolean'
        ? settings.showVimModeInStatusBar
        : DEFAULT_SETTINGS.showVimModeInStatusBar,
  };
}

/**
 * Validate settings against schema
 * @param settings Settings to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateSettings(settings: unknown): string[] {
  const errors: string[] = [];

  if (typeof settings !== 'object' || settings === null) {
    errors.push('Settings must be an object');
    return errors;
  }

  const s = settings as Record<string, unknown>;

  if (s.vimrcPath !== undefined) {
    if (typeof s.vimrcPath !== 'string') {
      errors.push('vimrcPath must be a string');
    } else if (s.vimrcPath.length === 0) {
      errors.push('vimrcPath cannot be empty');
    }
  }

  if (s.showLoadNotification !== undefined && typeof s.showLoadNotification !== 'boolean') {
    errors.push('showLoadNotification must be a boolean');
  }

  if (s.debugMode !== undefined && typeof s.debugMode !== 'boolean') {
    errors.push('debugMode must be a boolean');
  }

  if (s.showVimModeInStatusBar !== undefined && typeof s.showVimModeInStatusBar !== 'boolean') {
    errors.push('showVimModeInStatusBar must be a boolean');
  }

  if (s.debug !== undefined) {
    if (typeof s.debug !== 'object' || s.debug === null) {
      errors.push('debug must be an object');
    } else {
      const debug = s.debug as Record<string, unknown>;
      if (debug.enabled !== undefined && typeof debug.enabled !== 'boolean') {
        errors.push('debug.enabled must be a boolean');
      }
      if (debug.modules !== undefined && typeof debug.modules !== 'object') {
        errors.push('debug.modules must be an object');
      }
    }
  }

  return errors;
}
