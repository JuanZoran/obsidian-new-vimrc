/**
 * Event type definitions for the EventBus system
 */

import type { KeyMapping } from './mappings';
import type { VimrcSettings } from './settings';

/**
 * Event types emitted throughout the plugin
 */
export enum EventType {
  // File events
  FILE_CHANGED = 'file:changed',
  FILE_CREATED = 'file:created',
  FILE_DELETED = 'file:deleted',

  // Configuration events
  SETTINGS_CHANGED = 'settings:changed',

  // Vimrc loading events
  VIMRC_LOADING = 'vimrc:loading',
  VIMRC_LOADED = 'vimrc:loaded',
  VIMRC_ERROR = 'vimrc:error',

  // Mapping events
  MAPPING_ADDED = 'mapping:added',
  MAPPING_REMOVED = 'mapping:removed',
  MAPPING_APPLIED = 'mapping:applied',
  MAPPINGS_CLEARED = 'mappings:cleared',
  MAPPING_CONFLICT = 'mapping:conflict',

  // Error events
  ERROR_OCCURRED = 'error:occurred',
  ERROR_RECOVERED = 'error:recovered',

  // Vim API events
  VIM_READY = 'vim:ready',
  VIM_UNAVAILABLE = 'vim:unavailable',
}

/**
 * Load result from vimrc processing
 */
export interface LoadResult {
  success: boolean;
  path: string | null;
  mappingCount: number;
  errors: Array<{ lineNumber: number; message: string; raw: string }>;
  warnings: Array<{ lineNumber: number; message: string; raw: string }>;
}

/**
 * Mapping conflict information
 */
export interface MappingConflict {
  existingMapping: KeyMapping;
  newMapping: KeyMapping;
  resolution: 'override' | 'skip' | 'error';
}

/**
 * Event payload type mapping
 * Maps each event type to its corresponding payload structure
 */
export interface EventPayloadMap {
  [EventType.FILE_CHANGED]: { path: string };
  [EventType.FILE_CREATED]: { path: string };
  [EventType.FILE_DELETED]: { path: string };

  [EventType.SETTINGS_CHANGED]: {
    settings: VimrcSettings;
    previous: VimrcSettings;
  };

  [EventType.VIMRC_LOADING]: { path: string };
  [EventType.VIMRC_LOADED]: LoadResult;
  [EventType.VIMRC_ERROR]: { error: Error; path: string };

  [EventType.MAPPING_ADDED]: { mapping: KeyMapping };
  [EventType.MAPPING_REMOVED]: { mapping: KeyMapping };
  [EventType.MAPPING_APPLIED]: { mapping: KeyMapping };
  [EventType.MAPPINGS_CLEARED]: { count: number };
  [EventType.MAPPING_CONFLICT]: MappingConflict;

  [EventType.ERROR_OCCURRED]: { error: Error; context: string; severity: string };
  [EventType.ERROR_RECOVERED]: { error: Error; context: string; strategy: string };

  [EventType.VIM_READY]: Record<string, never>;
  [EventType.VIM_UNAVAILABLE]: { reason: string };
}

/**
 * Extract payload type for a specific event type
 */
export type EventPayload<T extends EventType> = EventPayloadMap[T];

/**
 * Event handler function type
 */
export type EventHandler<T extends EventType> = (payload: EventPayload<T>) => void | Promise<void>;

/**
 * Unsubscribe function returned by event subscriptions
 */
export type Unsubscribe = () => void;
