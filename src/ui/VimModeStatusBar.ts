/**
 * VimModeStatusBar - Status Bar Vim Mode Display
 *
 * Displays the current Vim mode (Normal, Insert, Visual, Replace) in the
 * Obsidian status bar. Listens to CodeMirror Vim mode changes and updates
 * the display accordingly.
 *
 * @module ui/VimModeStatusBar
 */

import type { App, Plugin, WorkspaceLeaf } from 'obsidian';
import type { IConfigManager } from '../types/settings';

/**
 * Vim mode types that can be displayed
 */
type VimModeType = 'normal' | 'insert' | 'visual' | 'replace';

/**
 * Mode display configuration
 */
interface ModeDisplay {
  text: string;
  className: string;
}

/**
 * Mode display mapping
 */
const MODE_DISPLAY: Record<VimModeType, ModeDisplay> = {
  normal: { text: 'NORMAL', className: 'vimrc-mode-normal' },
  insert: { text: 'INSERT', className: 'vimrc-mode-insert' },
  visual: { text: 'VISUAL', className: 'vimrc-mode-visual' },
  replace: { text: 'REPLACE', className: 'vimrc-mode-replace' },
};

/**
 * Configuration for VimModeStatusBar
 */
export interface VimModeStatusBarConfig {
  plugin: Plugin;
  app: App;
  configManager: IConfigManager;
}

/**
 * CodeMirror editor interface (minimal typing for what we need)
 */
interface CodeMirrorEditor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, handler: (...args: any[]) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off: (event: string, handler: (...args: any[]) => void) => void;
  getOption?: (option: string) => unknown;
}

/**
 * Vim state from CodeMirror
 */
interface VimState {
  mode?: string;
  subMode?: string;
}

/**
 * VimModeStatusBar implementation
 *
 * Creates a status bar item that displays the current Vim mode.
 * Automatically updates when the mode changes and respects the
 * showVimModeInStatusBar setting.
 */
export class VimModeStatusBar {
  private plugin: Plugin;
  private app: App;
  private configManager: IConfigManager;
  private statusBarEl: HTMLElement | null = null;
  private currentMode: VimModeType = 'normal';
  private settingsUnsubscribe: (() => void) | null = null;
  private activeEditorChangeHandler: (() => void) | null = null;
  private currentEditor: CodeMirrorEditor | null = null;
  private vimModeChangeHandler: ((vimState: VimState) => void) | null = null;

  constructor(config: VimModeStatusBarConfig) {
    this.plugin = config.plugin;
    this.app = config.app;
    this.configManager = config.configManager;
  }

  /**
   * Initialize the status bar item
   */
  initialize(): void {
    const settings = this.configManager.getSettings();

    if (settings.showVimModeInStatusBar) {
      this.createStatusBarItem();
      this.setupModeListener();
    }

    // Listen for settings changes
    this.settingsUnsubscribe = this.configManager.onSettingsChange((newSettings) => {
      if (newSettings.showVimModeInStatusBar && !this.statusBarEl) {
        this.createStatusBarItem();
        this.setupModeListener();
      } else if (!newSettings.showVimModeInStatusBar && this.statusBarEl) {
        this.destroy();
      }
    });
  }

  /**
   * Create the status bar item
   */
  private createStatusBarItem(): void {
    this.statusBarEl = this.plugin.addStatusBarItem();
    this.statusBarEl.addClass('vimrc-status-bar-mode');
    this.updateDisplay();
  }

  /**
   * Setup listener for Vim mode changes
   */
  private setupModeListener(): void {
    // Create the vim mode change handler
    this.vimModeChangeHandler = (vimState: VimState) => {
      const mode = this.parseMode(vimState?.mode, vimState?.subMode);
      if (mode !== this.currentMode) {
        this.currentMode = mode;
        this.updateDisplay();
      }
    };

    // Listen for active leaf changes to attach to new editors
    this.activeEditorChangeHandler = () => {
      this.attachToActiveEditor();
    };

    // Register the event with the plugin
    this.plugin.registerEvent(
      this.app.workspace.on('active-leaf-change', this.activeEditorChangeHandler)
    );

    // Attach to current editor
    this.attachToActiveEditor();
  }

  /**
   * Attach vim-mode-change listener to the active editor
   */
  private attachToActiveEditor(): void {
    // Detach from previous editor
    this.detachFromEditor();

    // Get the active markdown view's CodeMirror editor
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;

    const view = activeLeaf.view;
    if (!view || view.getViewType() !== 'markdown') return;

    // Try to get the CodeMirror editor instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor = (view as any).editor?.cm?.cm || (view as any).editor?.cm;
    if (!editor || typeof editor.on !== 'function') return;

    this.currentEditor = editor as CodeMirrorEditor;

    // Attach vim-mode-change listener
    if (this.vimModeChangeHandler) {
      this.currentEditor.on('vim-mode-change', this.vimModeChangeHandler);
    }

    // Try to get current vim state
    this.detectCurrentMode();
  }

  /**
   * Detach from the current editor
   */
  private detachFromEditor(): void {
    if (this.currentEditor && this.vimModeChangeHandler) {
      try {
        this.currentEditor.off('vim-mode-change', this.vimModeChangeHandler);
      } catch {
        // Ignore errors when detaching
      }
    }
    this.currentEditor = null;
  }

  /**
   * Try to detect the current Vim mode from the editor
   */
  private detectCurrentMode(): void {
    if (!this.currentEditor) return;

    try {
      // Try to get vim state from CodeMirror
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = this.currentEditor as any;
      const vimState = cm.state?.vim;

      if (vimState) {
        const mode = this.parseMode(vimState.mode, vimState.subMode);
        if (mode !== this.currentMode) {
          this.currentMode = mode;
          this.updateDisplay();
        }
      }
    } catch {
      // Default to normal mode if we can't detect
      this.currentMode = 'normal';
      this.updateDisplay();
    }
  }

  /**
   * Parse the mode string from CodeMirror
   */
  private parseMode(mode?: string, subMode?: string): VimModeType {
    if (!mode) return 'normal';

    const normalizedMode = mode.toLowerCase();

    if (normalizedMode === 'insert') return 'insert';
    if (normalizedMode === 'visual' || normalizedMode.includes('visual')) return 'visual';
    if (normalizedMode === 'replace' || subMode === 'replace') return 'replace';

    return 'normal';
  }

  /**
   * Update the status bar display
   */
  private updateDisplay(): void {
    if (!this.statusBarEl) return;

    const display = MODE_DISPLAY[this.currentMode];

    // Remove all mode classes
    Object.values(MODE_DISPLAY).forEach((d) => {
      this.statusBarEl?.removeClass(d.className);
    });

    // Add current mode class and update text
    this.statusBarEl.addClass(display.className);
    this.statusBarEl.setText(display.text);
  }

  /**
   * Get the current mode
   */
  getCurrentMode(): VimModeType {
    return this.currentMode;
  }

  /**
   * Manually set the mode (useful for testing or external updates)
   */
  setMode(mode: VimModeType): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.updateDisplay();
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.detachFromEditor();

    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }

    if (this.statusBarEl) {
      this.statusBarEl.remove();
      this.statusBarEl = null;
    }

    this.vimModeChangeHandler = null;
    this.activeEditorChangeHandler = null;
  }
}
