/**
 * MappingApplier - Apply Key Mappings to Vim
 *
 * Reads mappings from MappingStore and applies them via VimAdapter.
 * Handles conflict detection and reports them through EventBus.
 *
 * @module appliers/MappingApplier
 *
 * Requirements:
 * - 8.2: Read from MappingStore and apply via VimAdapter
 * - 8.5: Handle mapping conflicts and report them
 */

import type { IEventBus, IVimAdapter } from '../types/services';
import type {
  IMappingApplier,
  IMappingStore,
  KeyMapping,
  VimMode,
} from '../types/mappings';
import { MappingStatus } from '../types/mappings';
import { EventType, MappingConflict } from '../types/events';

/**
 * MappingApplier implementation
 *
 * Coordinates the application of key mappings from the store to Vim.
 * Detects conflicts when multiple mappings share the same source and mode.
 */
export class MappingApplier implements IMappingApplier {
  /**
   * MappingStore to read mappings from
   */
  private mappingStore: IMappingStore;

  /**
   * VimAdapter to apply mappings through
   */
  private vimAdapter: IVimAdapter;

  /**
   * EventBus for emitting events
   */
  private eventBus: IEventBus;

  /**
   * Track applied mappings by source+mode key for conflict detection
   */
  private appliedMappings = new Map<string, KeyMapping>();

  /**
   * Create a new MappingApplier
   *
   * @param mappingStore - Store to read mappings from
   * @param vimAdapter - Adapter to apply mappings through
   * @param eventBus - EventBus for event emission
   */
  constructor(
    mappingStore: IMappingStore,
    vimAdapter: IVimAdapter,
    eventBus: IEventBus
  ) {
    this.mappingStore = mappingStore;
    this.vimAdapter = vimAdapter;
    this.eventBus = eventBus;
  }

  /**
   * Generate a unique key for conflict detection
   *
   * @param source - Source key sequence
   * @param mode - Vim mode
   * @returns Unique key string
   */
  private getMappingKey(source: string, mode: VimMode): string {
    return `${mode}:${source}`;
  }

  /**
   * Check for conflicts and emit warning if found
   *
   * @param mapping - The mapping to check
   * @returns The existing conflicting mapping, or undefined if no conflict
   */
  private checkConflict(mapping: KeyMapping): KeyMapping | undefined {
    const key = this.getMappingKey(mapping.source, mapping.mode);
    const existing = this.appliedMappings.get(key);

    if (existing && existing.id !== mapping.id) {
      // Emit conflict event
      const conflict: MappingConflict = {
        existingMapping: existing,
        newMapping: mapping,
        resolution: 'override',
      };
      this.eventBus.emit(EventType.MAPPING_CONFLICT, conflict);
      return existing;
    }

    return undefined;
  }

  /**
   * Apply all mappings from the store
   *
   * Reads all mappings from MappingStore and applies them via VimAdapter.
   * Detects and reports conflicts for mappings with the same source and mode.
   */
  async applyAll(): Promise<void> {
    const mappings = this.mappingStore.getAll();

    // Sort by createdAt to ensure consistent application order
    const sortedMappings = [...mappings].sort((a, b) => a.createdAt - b.createdAt);

    for (const mapping of sortedMappings) {
      await this.apply(mapping);
    }
  }

  /**
   * Apply a single mapping
   *
   * @param mapping - The mapping to apply
   */
  async apply(mapping: KeyMapping): Promise<void> {
    // Check for conflicts
    this.checkConflict(mapping);

    try {
      // Apply the mapping via VimAdapter
      if (mapping.recursive) {
        this.vimAdapter.map(mapping.source, mapping.target, mapping.mode);
      } else {
        this.vimAdapter.noremap(mapping.source, mapping.target, mapping.mode);
      }

      // Track the applied mapping for conflict detection
      const key = this.getMappingKey(mapping.source, mapping.mode);
      this.appliedMappings.set(key, mapping);

      // Update mapping status
      mapping.status = MappingStatus.APPLIED;
      mapping.appliedAt = Date.now();

      // Emit applied event
      this.eventBus.emit(EventType.MAPPING_APPLIED, { mapping });
    } catch (error) {
      // Update mapping status to failed
      mapping.status = MappingStatus.FAILED;
      throw error;
    }
  }

  /**
   * Unapply a single mapping
   *
   * @param mapping - The mapping to unapply
   */
  async unapply(mapping: KeyMapping): Promise<void> {
    try {
      // Remove the mapping via VimAdapter
      this.vimAdapter.unmap(mapping.source, mapping.mode);

      // Remove from applied mappings tracking
      const key = this.getMappingKey(mapping.source, mapping.mode);
      this.appliedMappings.delete(key);

      // Update mapping status
      mapping.status = MappingStatus.REMOVED;
    } catch (error) {
      // Even if unmap fails, we should still update our tracking
      const key = this.getMappingKey(mapping.source, mapping.mode);
      this.appliedMappings.delete(key);
      throw error;
    }
  }

  /**
   * Unapply all mappings
   *
   * Removes all applied mappings from Vim.
   */
  async unapplyAll(): Promise<void> {
    // Get all applied mappings
    const appliedMappings = Array.from(this.appliedMappings.values());

    for (const mapping of appliedMappings) {
      await this.unapply(mapping);
    }

    // Clear the tracking map
    this.appliedMappings.clear();
  }

  /**
   * Get the count of currently applied mappings
   *
   * @returns Number of applied mappings
   */
  getAppliedCount(): number {
    return this.appliedMappings.size;
  }

  /**
   * Check if a mapping is currently applied
   *
   * @param source - Source key sequence
   * @param mode - Vim mode
   * @returns true if a mapping with this source and mode is applied
   */
  isApplied(source: string, mode: VimMode): boolean {
    const key = this.getMappingKey(source, mode);
    return this.appliedMappings.has(key);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.appliedMappings.clear();
  }
}
