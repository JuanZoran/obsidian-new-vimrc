/**
 * Logger Service Tests
 */

import { Logger, ModuleLogger, getLogger } from '../../src/services/Logger';
import type { DebugSettings } from '../../src/types/settings';
import { DEFAULT_DEBUG_MODULES } from '../../src/types/settings';

describe('Logger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize logger singleton', () => {
      const debugSettings: DebugSettings = {
        enabled: true,
        modules: { ...DEFAULT_DEBUG_MODULES },
      };

      const logger = Logger.initialize({
        prefix: 'Test',
        getDebugSettings: () => debugSettings,
      });

      expect(logger).toBeDefined();
      expect(Logger.getInstance()).toBe(logger);
    });
  });

  describe('logging', () => {
    let debugSettings: DebugSettings;

    beforeEach(() => {
      debugSettings = {
        enabled: true,
        modules: { ...DEFAULT_DEBUG_MODULES },
      };

      Logger.initialize({
        prefix: 'Test',
        getDebugSettings: () => debugSettings,
      });
    });

    it('should log debug messages when enabled', () => {
      const logger = Logger.getInstance()!;
      logger.debug('loader', 'Test message', { data: 123 });

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[Test:loader]',
        'Test message',
        { data: 123 }
      );
    });

    it('should not log debug messages when disabled', () => {
      debugSettings.enabled = false;
      const logger = Logger.getInstance()!;
      logger.debug('loader', 'Test message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should not log when specific module is disabled', () => {
      debugSettings.modules.loader = false;
      const logger = Logger.getInstance()!;
      logger.debug('loader', 'Test message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should always log warnings', () => {
      debugSettings.enabled = false;
      const logger = Logger.getInstance()!;
      logger.warn('loader', 'Warning message');

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[Test:loader]',
        'Warning message'
      );
    });

    it('should always log errors', () => {
      debugSettings.enabled = false;
      const logger = Logger.getInstance()!;
      logger.error('loader', 'Error message');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[Test:loader]',
        'Error message'
      );
    });
  });

  describe('ModuleLogger', () => {
    beforeEach(() => {
      Logger.initialize({
        prefix: 'Test',
        getDebugSettings: () => ({
          enabled: true,
          modules: { ...DEFAULT_DEBUG_MODULES },
        }),
      });
    });

    it('should create module-specific logger', () => {
      const moduleLogger = getLogger('mapping');
      expect(moduleLogger).toBeInstanceOf(ModuleLogger);
    });

    it('should log with module context', () => {
      const moduleLogger = getLogger('mapping');
      moduleLogger.debug('Mapping test');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[Test:mapping]',
        'Mapping test'
      );
    });

    it('should check if enabled', () => {
      const moduleLogger = getLogger('mapping');
      expect(moduleLogger.isEnabled()).toBe(true);
    });
  });

  describe('timing', () => {
    beforeEach(() => {
      Logger.initialize({
        prefix: 'Test',
        getDebugSettings: () => ({
          enabled: true,
          modules: { ...DEFAULT_DEBUG_MODULES },
        }),
      });
    });

    it('should measure execution time', async () => {
      const logger = Logger.getInstance()!;
      const endTimer = logger.time('loader', 'operation');

      await new Promise((resolve) => setTimeout(resolve, 10));
      endTimer();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[Test:loader] operation completed in')
      );
    });
  });
});
