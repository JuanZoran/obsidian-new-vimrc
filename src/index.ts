/**
 * Main exports for the Vimrc plugin
 */

// Types
export * from './types';

// Parser
export { VimrcParser } from './parser/VimrcParser';

// Mapper
export { KeyMapper } from './mapper/KeyMapper';

// Executor
export { CommandExecutor } from './executor/CommandExecutor';

// Settings
export { SettingsManager, VimrcSettingTab } from './settings/SettingsManager';

// Registry
export { 
    CommandRegistry, 
    createConfiguredRegistry,
    MAPPING_COMMAND_TYPES,
    EXECUTOR_COMMAND_TYPES 
} from './registry/CommandRegistry';

// Errors
export { 
    ErrorHandler, 
    ErrorSeverity,
    type ErrorReport 
} from './errors/ErrorHandler';
