/**
 * Unit tests for ConfigManager
 */

import { ConfigManager, ISettingsPersistence } from '../../src/infrastructure/ConfigManager';
import { EventBus } from '../../src/core/EventBus';
import { EventType } from '../../src/types/events';
import { DEFAULT_SETTINGS, VimrcSettings } from '../../src/types/settings';

/**
 * Mock persistence implementation for testing
 */
class MockPersistence implements ISettingsPersistence {
  private data: unknown = null;

  async loadData(): Promise<unknown> {
    return this.data;
  }

  async saveData(data: unknown): Promise<void> {
    this.data = data;
  }

  setData(data: unknown): void {
    this.data = data;
  }

  getData(): unknown {
    return this.data;
  }
}

describe('ConfigManager', () => {
  let eventBus: EventBus;
  let persistence: MockPersistence;
  let configManager: ConfigManager;

  beforeEach(() => {
    eventBus = new EventBus();
    persistence = new MockPersistence();
    configManager = new ConfigManager(eventBus, persistence);
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('initialization', () => {
    it('should load default settings when no data exists', async () => {
      await configManager.initialize();

      const settings = configManager.getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should load saved settings from persistence', async () => {
      const savedSettings: VimrcSettings = {
        vimrcPath: 'custom.vimrc',
        showLoadNotification: true,
        debugMode: true,
        debug: {
          enabled: true,
          modules: {
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
            surround: true,
            statusBar: false,
          },
        },
        showVimModeInStatusBar: true,
      };
      persistence.setData(savedSettings);

      await configManager.initialize();

      const settings = configManager.getSettings();
      expect(settings).toEqual(savedSettings);
    });

    it('should normalize partial settings with defaults', async () => {
      persistence.setData({ vimrcPath: 'custom.vimrc' });

      await configManager.initialize();

      const settings = configManager.getSettings();
      expect(settings.vimrcPath).toBe('custom.vimrc');
      expect(settings.showLoadNotification).toBe(DEFAULT_SETTINGS.showLoadNotification);
      expect(settings.debugMode).toBe(DEFAULT_SETTINGS.debugMode);
    });

    it('should handle invalid settings gracefully', async () => {
      persistence.setData({ vimrcPath: '', showLoadNotification: 'invalid' });

      await configManager.initialize();

      const settings = configManager.getSettings();
      // Empty vimrcPath should be replaced with default
      expect(settings.vimrcPath).toBe(DEFAULT_SETTINGS.vimrcPath);
      // Invalid boolean should be replaced with default
      expect(settings.showLoadNotification).toBe(DEFAULT_SETTINGS.showLoadNotification);
    });

    it('should only initialize once', async () => {
      await configManager.initialize();
      persistence.setData({ vimrcPath: 'changed.vimrc' });
      await configManager.initialize();

      const settings = configManager.getSettings();
      // Should still have default settings, not the changed ones
      expect(settings.vimrcPath).toBe(DEFAULT_SETTINGS.vimrcPath);
    });
  });

  describe('getSettings', () => {
    it('should return settings synchronously', async () => {
      await configManager.initialize();

      // This should not return a Promise
      const settings = configManager.getSettings();
      expect(settings).toBeDefined();
      expect(typeof settings.vimrcPath).toBe('string');
    });

    it('should return a copy of settings to prevent mutation', async () => {
      await configManager.initialize();

      const settings1 = configManager.getSettings();
      settings1.vimrcPath = 'mutated.vimrc';

      const settings2 = configManager.getSettings();
      expect(settings2.vimrcPath).toBe(DEFAULT_SETTINGS.vimrcPath);
    });
  });

  describe('updateSettings', () => {
    it('should update settings with partial values', async () => {
      await configManager.initialize();

      await configManager.updateSettings({ debugMode: true });

      const settings = configManager.getSettings();
      expect(settings.debugMode).toBe(true);
      expect(settings.vimrcPath).toBe(DEFAULT_SETTINGS.vimrcPath);
    });

    it('should persist updated settings', async () => {
      await configManager.initialize();

      await configManager.updateSettings({ vimrcPath: 'new.vimrc' });

      const savedData = persistence.getData() as VimrcSettings;
      expect(savedData.vimrcPath).toBe('new.vimrc');
    });

    it('should emit SETTINGS_CHANGED event', async () => {
      await configManager.initialize();

      const eventHandler = jest.fn();
      eventBus.on(EventType.SETTINGS_CHANGED, eventHandler);

      await configManager.updateSettings({ debugMode: true });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith({
        settings: expect.objectContaining({ debugMode: true }),
        previous: expect.objectContaining({ debugMode: false }),
      });
    });

    it('should notify manual change listeners', async () => {
      await configManager.initialize();

      const listener = jest.fn();
      configManager.onSettingsChange(listener);

      await configManager.updateSettings({ showLoadNotification: true });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ showLoadNotification: true })
      );
    });
  });

  describe('resetToDefaults', () => {
    it('should reset all settings to defaults', async () => {
      persistence.setData({
        vimrcPath: 'custom.vimrc',
        showLoadNotification: true,
        debugMode: true,
      });
      await configManager.initialize();

      await configManager.resetToDefaults();

      const settings = configManager.getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should persist default settings', async () => {
      persistence.setData({ vimrcPath: 'custom.vimrc' });
      await configManager.initialize();

      await configManager.resetToDefaults();

      const savedData = persistence.getData() as VimrcSettings;
      expect(savedData).toEqual(DEFAULT_SETTINGS);
    });

    it('should emit SETTINGS_CHANGED event', async () => {
      persistence.setData({ debugMode: true });
      await configManager.initialize();

      const eventHandler = jest.fn();
      eventBus.on(EventType.SETTINGS_CHANGED, eventHandler);

      await configManager.resetToDefaults();

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith({
        settings: DEFAULT_SETTINGS,
        previous: expect.objectContaining({ debugMode: true }),
      });
    });
  });

  describe('onSettingsChange', () => {
    it('should return unsubscribe function', async () => {
      await configManager.initialize();

      const listener = jest.fn();
      const unsubscribe = configManager.onSettingsChange(listener);

      await configManager.updateSettings({ debugMode: true });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      await configManager.updateSettings({ debugMode: false });
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should handle errors in listeners gracefully', async () => {
      await configManager.initialize();

      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      configManager.onSettingsChange(errorListener);
      configManager.onSettingsChange(normalListener);

      // Should not throw
      await configManager.updateSettings({ debugMode: true });

      // Both listeners should have been called
      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(configManager.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await configManager.initialize();
      expect(configManager.isInitialized()).toBe(true);
    });
  });
});
