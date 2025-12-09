/**
 * MappingStore - Key Mapping Storage
 *
 * Stores and manages key mappings with:
 * - CRUD operations for mappings
 * - Query by mode, source, or target
 * - Event emission through EventBus
 *
 * @module stores/MappingStore
 */

import type { IEventBus } from '../types/services';
import type {
  IMappingStore,
  KeyMapping,
  MappingQuery,
  VimMode,
} from '../types/mappings';
import { EventType } from '../types/events';

/**
 * MappingStore implementation
 *
 * Manages storage and retrieval of key mappings.
 * Emits events when mappings are added, removed, or cleared.
 */
export class MappingStore implements IMappingStore {
  /**
   * Internal storage for mappings, keyed by ID
   */
  private mappings = new Map<string, KeyMapping>();

  /**
   * EventBus for emitting mapping events
   */
  private eventBus: IEventBus;

  /**
   * Create a new MappingStore
   *
   * @param eventBus - EventBus for event emission
   */
  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Add a mapping to the store
   *
   * @param mapping - The mapping to add
   */
  add(mapping: KeyMapping): void {
    this.mappings.set(mapping.id, mapping);
    this.eventBus.emit(EventType.MAPPING_ADDED, { mapping });
  }

  /**
   * Remove a mapping by ID
   *
   * @param id - The ID of the mapping to remove
   * @returns true if the mapping was removed, false if not found
   */
  remove(id: string): boolean {
    const mapping = this.mappings.get(id);
    if (!mapping) {
      return false;
    }

    this.mappings.delete(id);
    this.eventBus.emit(EventType.MAPPING_REMOVED, { mapping });
    return true;
  }

  /**
   * Remove all mappings from a specific source key
   *
   * @param source - The source key sequence to match
   * @param mode - Optional mode to filter by
   * @returns The number of mappings removed
   */
  removeBySource(source: string, mode?: VimMode): number {
    const toRemove: KeyMapping[] = [];

    for (const mapping of this.mappings.values()) {
      if (mapping.source === source) {
        if (mode === undefined || mapping.mode === mode) {
          toRemove.push(mapping);
        }
      }
    }

    for (const mapping of toRemove) {
      this.mappings.delete(mapping.id);
      this.eventBus.emit(EventType.MAPPING_REMOVED, { mapping });
    }

    return toRemove.length;
  }

  /**
   * Get a mapping by ID
   *
   * @param id - The ID of the mapping to retrieve
   * @returns The mapping if found, undefined otherwise
   */
  get(id: string): KeyMapping | undefined {
    return this.mappings.get(id);
  }

  /**
   * Get all mappings
   *
   * @returns Array of all stored mappings
   */
  getAll(): KeyMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Get mappings by mode
   *
   * @param mode - The Vim mode to filter by
   * @returns Array of mappings for the specified mode
   */
  getByMode(mode: VimMode): KeyMapping[] {
    const result: KeyMapping[] = [];

    for (const mapping of this.mappings.values()) {
      if (mapping.mode === mode) {
        result.push(mapping);
      }
    }

    return result;
  }

  /**
   * Query mappings with filters
   *
   * @param query - Query options to filter mappings
   * @returns Array of mappings matching the query
   */
  query(query: MappingQuery): KeyMapping[] {
    const result: KeyMapping[] = [];

    for (const mapping of this.mappings.values()) {
      if (this.matchesQuery(mapping, query)) {
        result.push(mapping);
      }
    }

    return result;
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    const count = this.mappings.size;
    this.mappings.clear();
    this.eventBus.emit(EventType.MAPPINGS_CLEARED, { count });
  }

  /**
   * Get the count of mappings
   *
   * @returns The number of stored mappings
   */
  count(): number {
    return this.mappings.size;
  }

  /**
   * Check if a mapping matches a query
   *
   * @param mapping - The mapping to check
   * @param query - The query to match against
   * @returns true if the mapping matches all query criteria
   */
  private matchesQuery(mapping: KeyMapping, query: MappingQuery): boolean {
    if (query.mode !== undefined && mapping.mode !== query.mode) {
      return false;
    }

    if (query.source !== undefined && mapping.source !== query.source) {
      return false;
    }

    if (query.target !== undefined && mapping.target !== query.target) {
      return false;
    }

    if (query.status !== undefined && mapping.status !== query.status) {
      return false;
    }

    return true;
  }
}
