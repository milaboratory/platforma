/**
 * BlockStorage - Typed storage abstraction for block persistent data.
 *
 * This module provides:
 * - A typed structure for block storage with versioning and plugin support
 * - Utility functions for manipulating storage
 * - Handler interfaces for model-level customization
 *
 * @module block_storage
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Discriminator key for BlockStorage format detection.
 * This unique hash-based key identifies data as BlockStorage vs legacy formats.
 */
export const BLOCK_STORAGE_KEY = '__pl_a7f3e2b9__';

/**
 * Current BlockStorage schema version.
 * Increment this when the storage structure itself changes (not block state migrations).
 */
export const BLOCK_STORAGE_SCHEMA_VERSION = 'v1';

/**
 * Type for valid schema versions
 */
export type BlockStorageSchemaVersion = 'v1'; // Add 'v2', 'v3', etc. as schema evolves

/**
 * Plugin key type - keys starting with `@plugin/` are reserved for plugin data
 */
export type PluginKey = `@plugin/${string}`;

/**
 * Core BlockStorage type that holds:
 * - __pl_a7f3e2b9__: Schema version (discriminator key identifies BlockStorage format)
 * - __dataVersion: Version number for block data migrations
 * - __data: The block's user-facing data (state)
 * - @plugin/*: Optional plugin-specific data
 */
export type BlockStorage<TState = unknown> = {
  /** Schema version - the key itself is the discriminator */
  readonly [BLOCK_STORAGE_KEY]: BlockStorageSchemaVersion;
  /** Version of the block data, used for migrations */
  __dataVersion: number;
  /** The block's user-facing data (state) */
  __data: TState;
} & {
  /** Plugin-specific data, keyed by `@plugin/<pluginName>` */
  [K in PluginKey]?: unknown;
};

/**
 * Type guard to check if a value is a valid BlockStorage object.
 * Checks for the discriminator key and valid schema version.
 */
export function isBlockStorage(value: unknown): value is BlockStorage {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  const schemaVersion = obj[BLOCK_STORAGE_KEY];
  // Currently only 'v1' is valid, but this allows future versions
  return schemaVersion === 'v1'; // Add more versions as schema evolves
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a BlockStorage with the given initial data
 *
 * @param initialData - The initial data value (defaults to empty object)
 * @param version - The initial data version (defaults to 1)
 * @returns A new BlockStorage instance with discriminator key
 */
export function createBlockStorage<TState = unknown>(
  initialData: TState = {} as TState,
  version: number = 1,
): BlockStorage<TState> {
  return {
    [BLOCK_STORAGE_KEY]: BLOCK_STORAGE_SCHEMA_VERSION,
    __dataVersion: version,
    __data: initialData,
  };
}

/**
 * Normalizes raw storage data to BlockStorage format.
 * If the input is already a BlockStorage, returns it as-is.
 * If the input is legacy format (raw state), wraps it in BlockStorage structure.
 *
 * @param raw - Raw storage data (may be legacy format or BlockStorage)
 * @returns Normalized BlockStorage
 */
export function normalizeBlockStorage<TState = unknown>(raw: unknown): BlockStorage<TState> {
  if (isBlockStorage(raw)) {
    return raw as BlockStorage<TState>;
  }
  // Legacy format: raw is the state directly
  return createBlockStorage(raw as TState, 1);
}

// =============================================================================
// Data Access & Update Functions
// =============================================================================

/**
 * Gets the data from BlockStorage
 *
 * @param storage - The BlockStorage instance
 * @returns The data value
 */
export function getStorageData<TState>(storage: BlockStorage<TState>): TState {
  return storage.__data;
}

/** Payload for storage mutation operations. SDK defines specific operations. */
export type MutateStoragePayload<T = unknown> = { operation: 'update-data'; value: T };

/**
 * Updates the data in BlockStorage (immutable)
 *
 * @param storage - The current BlockStorage
 * @param payload - The update payload with operation and value
 * @returns A new BlockStorage with updated data
 */
export function updateStorageData<TValue = unknown>(
  storage: BlockStorage<TValue>,
  payload: MutateStoragePayload<TValue>,
): BlockStorage<TValue> {
  switch (payload.operation) {
    case 'update-data':
      return { ...storage, __data: payload.value };
    default:
      throw new Error(`Unknown storage operation: ${(payload as { operation: string }).operation}`);
  }
}

/**
 * Gets the data version from BlockStorage
 *
 * @param storage - The BlockStorage instance
 * @returns The data version number
 */
export function getStorageDataVersion(storage: BlockStorage): number {
  return storage.__dataVersion;
}

/**
 * Updates the data version in BlockStorage (immutable)
 *
 * @param storage - The current BlockStorage
 * @param version - The new version number
 * @returns A new BlockStorage with updated version
 */
export function updateStorageDataVersion<TState>(
  storage: BlockStorage<TState>,
  version: number,
): BlockStorage<TState> {
  return { ...storage, __dataVersion: version };
}

// =============================================================================
// Plugin Data Functions
// =============================================================================

/**
 * Gets plugin-specific data from BlockStorage
 *
 * @param storage - The BlockStorage instance
 * @param pluginName - The plugin name (without `@plugin/` prefix)
 * @returns The plugin data or undefined if not set
 */
export function getPluginData<TData = unknown>(
  storage: BlockStorage,
  pluginName: string,
): TData | undefined {
  const key: PluginKey = `@plugin/${pluginName}`;
  return storage[key] as TData | undefined;
}

/**
 * Sets plugin-specific data in BlockStorage (immutable)
 *
 * @param storage - The current BlockStorage
 * @param pluginName - The plugin name (without `@plugin/` prefix)
 * @param data - The plugin data to store
 * @returns A new BlockStorage with updated plugin data
 */
export function setPluginData<TState>(
  storage: BlockStorage<TState>,
  pluginName: string,
  data: unknown,
): BlockStorage<TState> {
  const key: PluginKey = `@plugin/${pluginName}`;
  return { ...storage, [key]: data };
}

/**
 * Removes plugin-specific data from BlockStorage (immutable)
 *
 * @param storage - The current BlockStorage
 * @param pluginName - The plugin name (without `@plugin/` prefix)
 * @returns A new BlockStorage with the plugin data removed
 */
export function removePluginData<TState>(
  storage: BlockStorage<TState>,
  pluginName: string,
): BlockStorage<TState> {
  const key: PluginKey = `@plugin/${pluginName}`;
  const { [key]: _, ...rest } = storage;
  return rest as BlockStorage<TState>;
}

/**
 * Gets all plugin names that have data stored
 *
 * @param storage - The BlockStorage instance
 * @returns Array of plugin names (without `@plugin/` prefix)
 */
export function getPluginNames(storage: BlockStorage): string[] {
  return Object.keys(storage)
    .filter((key): key is PluginKey => key.startsWith('@plugin/'))
    .map((key) => key.slice('@plugin/'.length));
}

// =============================================================================
// Generic Storage Access
// =============================================================================

/**
 * Gets a value from BlockStorage by key
 *
 * @param storage - The BlockStorage instance
 * @param key - The key to retrieve
 * @returns The value at the given key
 */
export function getFromStorage<
  TState,
  K extends keyof BlockStorage<TState>,
>(storage: BlockStorage<TState>, key: K): BlockStorage<TState>[K] {
  return storage[key];
}

/**
 * Updates a value in BlockStorage by key (immutable)
 *
 * @param storage - The current BlockStorage
 * @param key - The key to update
 * @param value - The new value
 * @returns A new BlockStorage with the updated value
 */
export function updateStorage<
  TState,
  K extends keyof BlockStorage<TState>,
>(
  storage: BlockStorage<TState>,
  key: K,
  value: BlockStorage<TState>[K],
): BlockStorage<TState> {
  return { ...storage, [key]: value };
}

// =============================================================================
// Storage Handlers (for Phase 2 - Model-Level Customization)
// =============================================================================

/**
 * Interface for model-configurable storage operations.
 * These handlers allow block models to customize how storage is managed.
 */
export interface BlockStorageHandlers<TState = unknown> {
  /**
   * Called when setState is invoked - transforms the new state before storing.
   * Default behavior: replaces the state directly.
   *
   * @param currentStorage - The current BlockStorage
   * @param newState - The new state being set
   * @returns The updated BlockStorage
   */
  transformStateForStorage?: (
    currentStorage: BlockStorage<TState>,
    newState: TState,
  ) => BlockStorage<TState>;

  /**
   * Called when reading state for args derivation.
   * Default behavior: returns the state directly.
   *
   * @param storage - The current BlockStorage
   * @returns The state to use for args derivation
   */
  deriveStateForArgs?: (storage: BlockStorage<TState>) => TState;

  /**
   * Called during storage schema migration.
   * Default behavior: updates stateVersion only.
   *
   * @param oldStorage - The storage before migration
   * @param fromVersion - The version migrating from
   * @param toVersion - The version migrating to
   * @returns The migrated BlockStorage
   */
  migrateStorage?: (
    oldStorage: BlockStorage<TState>,
    fromVersion: number,
    toVersion: number,
  ) => BlockStorage<TState>;
}

/**
 * Default implementations of storage handlers
 */
export const defaultBlockStorageHandlers: Required<BlockStorageHandlers<unknown>> = {
  transformStateForStorage: <TState>(
    storage: BlockStorage<TState>,
    newState: TState,
  ): BlockStorage<TState> => updateStorageData(storage, { operation: 'update-data', value: newState }),

  deriveStateForArgs: <TState>(storage: BlockStorage<TState>): TState => getStorageData(storage),

  migrateStorage: <TState>(
    storage: BlockStorage<TState>,
    _fromVersion: number,
    toVersion: number,
  ): BlockStorage<TState> => updateStorageDataVersion(storage, toVersion),
};

/**
 * Merges custom handlers with defaults
 *
 * @param customHandlers - Custom handlers to merge
 * @returns Complete handlers with defaults for missing functions
 */
export function mergeBlockStorageHandlers<TState>(
  customHandlers?: BlockStorageHandlers<TState>,
): Required<BlockStorageHandlers<TState>> {
  return {
    ...defaultBlockStorageHandlers,
    ...customHandlers,
  } as Required<BlockStorageHandlers<TState>>;
}
