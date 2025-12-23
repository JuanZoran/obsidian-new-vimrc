/**
 * Mapping-related type definitions
 */

/**
 * Vim editing modes
 */
export enum VimMode {
  NORMAL = 'normal',
  INSERT = 'insert',
  VISUAL = 'visual',
  OPERATOR_PENDING = 'operatorPending',
  ALL = 'all',
}

/**
 * Status of a key mapping
 */
export enum MappingStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  FAILED = 'failed',
  REMOVED = 'removed',
}

/**
 * Key mapping with metadata
 */
export interface KeyMapping {
  /** Unique identifier for the mapping */
  id: string;
  /** Source key sequence (left-hand side) */
  source: string;
  /** Target key sequence or command (right-hand side) */
  target: string;
  /** Vim mode this mapping applies to */
  mode: VimMode;
  /** Whether the mapping is recursive */
  recursive: boolean;
  /** Line number in the vimrc file */
  lineNumber: number;
  /** Timestamp when the mapping was created */
  createdAt: number;
  /** Timestamp when the mapping was applied (if applicable) */
  appliedAt?: number;
  /** Current status of the mapping */
  status: MappingStatus;
}

/**
 * Configuration for creating a key mapping
 */
export interface MappingConfig {
  from: string;
  to: string;
  mode: VimMode;
  recursive: boolean;
}

/**
 * Query options for filtering mappings
 */
export interface MappingQuery {
  mode?: VimMode;
  source?: string;
  target?: string;
  status?: MappingStatus;
}

/**
 * Mapping store interface
 */
export interface IMappingStore {
  /**
   * Add a mapping to the store
   */
  add(mapping: KeyMapping): void;

  /**
   * Remove a mapping by ID
   */
  remove(id: string): boolean;

  /**
   * Remove all mappings from a specific source key
   */
  removeBySource(source: string, mode?: VimMode): number;

  /**
   * Get a mapping by ID
   */
  get(id: string): KeyMapping | undefined;

  /**
   * Get all mappings
   */
  getAll(): KeyMapping[];

  /**
   * Get mappings by mode
   */
  getByMode(mode: VimMode): KeyMapping[];

  /**
   * Query mappings with filters
   */
  query(query: MappingQuery): KeyMapping[];

  /**
   * Clear all mappings
   */
  clear(): void;

  /**
   * Get the count of mappings
   */
  count(): number;
}

/**
 * Mapping applier interface
 */
export interface IMappingApplier {
  /**
   * Apply all mappings from the store
   */
  applyAll(): Promise<void>;

  /**
   * Apply a single mapping
   */
  apply(mapping: KeyMapping): Promise<void>;

  /**
   * Unapply a single mapping
   */
  unapply(mapping: KeyMapping): Promise<void>;

  /**
   * Unapply all mappings
   */
  unapplyAll(): Promise<void>;
}

/**
 * Special key mappings from Vim notation to actual keys
 */
export const SPECIAL_KEYS: Record<string, string> = {
  '<CR>': '\n',
  '<Enter>': '\n',
  '<Return>': '\n',
  '<Esc>': '\x1b',
  '<Space>': ' ',
  '<Tab>': '\t',
  '<BS>': '\b',
  '<Backspace>': '\b',
  '<Del>': '\x7f',
  '<Delete>': '\x7f',
  '<Up>': 'ArrowUp',
  '<Down>': 'ArrowDown',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Home>': 'Home',
  '<End>': 'End',
  '<PageUp>': 'PageUp',
  '<PageDown>': 'PageDown',
  '<C-a>': 'Ctrl-a',
  '<C-b>': 'Ctrl-b',
  '<C-c>': 'Ctrl-c',
  '<C-d>': 'Ctrl-d',
  '<C-e>': 'Ctrl-e',
  '<C-f>': 'Ctrl-f',
  '<C-g>': 'Ctrl-g',
  '<C-h>': 'Ctrl-h',
  '<C-i>': 'Ctrl-i',
  '<C-j>': 'Ctrl-j',
  '<C-k>': 'Ctrl-k',
  '<C-l>': 'Ctrl-l',
  '<C-m>': 'Ctrl-m',
  '<C-n>': 'Ctrl-n',
  '<C-o>': 'Ctrl-o',
  '<C-p>': 'Ctrl-p',
  '<C-q>': 'Ctrl-q',
  '<C-r>': 'Ctrl-r',
  '<C-s>': 'Ctrl-s',
  '<C-t>': 'Ctrl-t',
  '<C-u>': 'Ctrl-u',
  '<C-v>': 'Ctrl-v',
  '<C-w>': 'Ctrl-w',
  '<C-x>': 'Ctrl-x',
  '<C-y>': 'Ctrl-y',
  '<C-z>': 'Ctrl-z',
};
