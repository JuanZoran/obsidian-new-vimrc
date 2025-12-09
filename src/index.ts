/**
 * Main exports for the Vimrc plugin
 */

// Types
export * from './types';

// Core
export { ServiceContainer } from './core/ServiceContainer';
export { EventBus } from './core/EventBus';

// Infrastructure
export { ConfigManager } from './infrastructure/ConfigManager';
export type { ISettingsPersistence } from './infrastructure/ConfigManager';
export { ErrorHandler as EnhancedErrorHandler } from './infrastructure/ErrorHandler';
export type { RecoveryResult, RecoveryStrategy, AggregatedError } from './infrastructure/ErrorHandler';

// Services
export { VimAdapter } from './services/VimAdapter';
export { VimrcLoader, createFileAdapter } from './services/VimrcLoader';
export type { IFileAdapter } from './services/VimrcLoader';
export { PluginApi } from './services/PluginApi';
export type { EditorPosition, MotionCallbackArgs, MotionCallback, ActionCallback } from './services/PluginApi';
export { Logger, ModuleLogger, getLogger } from './services/Logger';
export type { LogLevel, LoggerConfig } from './services/Logger';

// Stores
export { MappingStore } from './stores/MappingStore';

// Appliers
export { MappingApplier } from './appliers/MappingApplier';

// Parser (moved to services)
export { VimrcParser } from './services/VimrcParser';

// Settings
export { SettingsManager, VimrcSettingTab } from './settings/SettingsManager';

// UI
export { SettingsTab } from './ui/SettingsTab';
export type { SettingsTabConfig, ReloadCallback } from './ui/SettingsTab';
export { VimModeStatusBar } from './ui/VimModeStatusBar';
export type { VimModeStatusBarConfig } from './ui/VimModeStatusBar';

// Registry
export { 
    CommandRegistry, 
    MAPPING_COMMAND_TYPES,
    EXECUTOR_COMMAND_TYPES 
} from './registry/CommandRegistry';

