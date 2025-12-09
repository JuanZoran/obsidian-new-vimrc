/**
 * Command Handlers Module
 *
 * Exports all command handler implementations for the vimrc plugin.
 *
 * @module handlers
 */

// Base handler
export { BaseHandler } from './BaseHandler';
export type { HandlerDependencies } from './BaseHandler';

// Obsidian command executor (shared logic)
export { ObsidianCommandExecutor } from './ObsidianCommandExecutor';
export type { CommandValidationResult } from './ObsidianCommandExecutor';

// Mapping handler
export { MappingHandler } from './MappingHandler';
export type { MappingHandlerDependencies } from './MappingHandler';

// Obmap handler
export { ObmapHandler } from './ObmapHandler';
export type { ObmapHandlerDependencies, ObmapDefinition } from './ObmapHandler';

// Exmap handler
export { ExmapHandler } from './ExmapHandler';
export type { ExmapHandlerDependencies, ExmapDefinition } from './ExmapHandler';

// Let handler
export { LetHandler } from './LetHandler';
export type {
  LetHandlerDependencies,
  VariableDefinition,
  LeaderKeyChangeCallback,
} from './LetHandler';
