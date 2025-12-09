/**
 * Type definitions for the Vimrc plugin architecture
 * 
 * This module exports all type definitions used throughout the plugin.
 */

// Re-export all types from submodules
export * from './events';
export * from './commands';
export * from './mappings';
export * from './settings';

// Re-export service-related types
export type { ServiceToken, ServiceFactory, IServiceContainer } from './services';
export { ServiceTokens } from './services';
