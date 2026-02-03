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

import type { Branded } from './branding';

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
 * Default data version for new blocks without migrations.
 * Unique identifier ensures blocks are created via DataModel API.
 */
export const DATA_MODEL_DEFAULT_VERSION = '__pl_v1_d4e8f2a1__';

/**
 * Type for valid schema versions
 */
export type BlockStorageSchemaVersion = 'v1'; // Add 'v2', 'v3', etc. as schema evolves

/**
 * Branded type for plugin names - globally unique plugin type identifiers.
 * Using a branded type enforces explicit casting (`as PluginName`) which makes
 * it easy to find all plugin name definitions in the codebase and verify uniqueness.
 */
export type PluginName = Branded<string, 'PluginName'>;

/**
 * Plugin registry - maps pluginId (unique within a block) to pluginName (globally unique plugin type).
 * Using a Record highlights that pluginIds must be unique within a block.
 */
export type PluginRegistry = Record<string, PluginName>;

/**
 * Versioned data - used for both block data and plugin data
 */
export interface VersionedData<TData = unknown> {
  /** Version of the data, used for migrations */
  __dataVersion: string;
  /** The persistent data */
  __data: TData;
}

/**
 * Core BlockStorage type that holds:
 * - __pl_a7f3e2b9__: Schema version (discriminator key identifies BlockStorage format)
 * - __dataVersion: Version key for block data migrations
 * - __data: The block's user-facing data (state)
 * - __pluginRegistry: Map from pluginId to pluginName (optional)
 * - __plugins: Plugin-specific data keyed by pluginId (optional)
 */
export type BlockStorage<TState = unknown> = {
  /** Schema version - the key itself is the discriminator */
  readonly [BLOCK_STORAGE_KEY]: BlockStorageSchemaVersion;
  /** Registry of plugins: pluginId -> pluginName */
  __pluginRegistry?: PluginRegistry;
  /** Plugin-specific data, keyed by pluginId */
  __plugins?: Record<string, VersionedData<unknown>>;
} & VersionedData<TState>;

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
 * @param version - The initial data version key (defaults to DATA_MODEL_DEFAULT_VERSION)
 * @returns A new BlockStorage instance with discriminator key
 */
export function createBlockStorage<TState = unknown>(
  initialData: TState = {} as TState,
  version: string = DATA_MODEL_DEFAULT_VERSION,
): BlockStorage<TState> {
  return {
    [BLOCK_STORAGE_KEY]: BLOCK_STORAGE_SCHEMA_VERSION,
    __dataVersion: version,
    __data: initialData,
    __pluginRegistry: {},
    __plugins: {},
  };
}

/**
 * Normalizes raw storage data to BlockStorage format.
 * If the input is already a BlockStorage, returns it as-is (with defaults for missing fields).
 * If the input is legacy format (raw state), wraps it in BlockStorage structure.
 *
 * @param raw - Raw storage data (may be legacy format or BlockStorage)
 * @returns Normalized BlockStorage
 */
export function normalizeBlockStorage<TState = unknown>(raw: unknown): BlockStorage<TState> {
  if (isBlockStorage(raw)) {
    const storage = raw as BlockStorage<TState>;
    return {
      ...storage,
      // Fix for early released version where __dataVersion was a number
      __dataVersion: typeof storage.__dataVersion === 'number'
        ? DATA_MODEL_DEFAULT_VERSION
        : storage.__dataVersion,
      // Ensure plugin fields have defaults
      __pluginRegistry: storage.__pluginRegistry ?? {},
      __plugins: storage.__plugins ?? {},
    };
  }
  // Legacy format: raw is the state directly
  return createBlockStorage(raw as TState);
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

/**
 * Derives data from raw block storage.
 * This function is meant to be called from sdk/ui-vue to extract
 * user-facing data from the raw storage returned by the middle layer.
 *
 * The middle layer returns raw storage (opaque to it), and the UI
 * uses this function to derive the actual data value.
 *
 * @param rawStorage - Raw storage data from middle layer (may be any format)
 * @returns The extracted data value, or undefined if storage is undefined/null
 */
export function deriveDataFromStorage<TData = unknown>(
  rawStorage: unknown,
): TData {
  // Normalize to BlockStorage format (handles legacy formats too)
  const storage = normalizeBlockStorage<TData>(rawStorage);
  return getStorageData(storage);
}

/** Payload for storage mutation operations. SDK defines specific operations. */
export type MutateStoragePayload<T = unknown> =
  | { operation: 'update-data'; value: T }
  | { operation: 'update-plugin'; pluginId: string; value: unknown };

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
    case 'update-plugin': {
      const { pluginId, value } = payload;
      const currentPlugins = storage.__plugins ?? {};
      const existingEntry = currentPlugins[pluginId];
      const version = existingEntry?.__dataVersion ?? DATA_MODEL_DEFAULT_VERSION;
      return {
        ...storage,
        __plugins: {
          ...currentPlugins,
          [pluginId]: {
            __dataVersion: version,
            __data: value,
          },
        },
      };
    }
    default:
      throw new Error(`Unknown storage operation: ${(payload as { operation: string }).operation}`);
  }
}

/**
 * Gets the data version from BlockStorage
 *
 * @param storage - The BlockStorage instance
 * @returns The data version key
 */
export function getStorageDataVersion(storage: BlockStorage): string {
  return storage.__dataVersion;
}

/**
 * Updates the data version in BlockStorage (immutable)
 *
 * @param storage - The current BlockStorage
 * @param version - The new version key
 * @returns A new BlockStorage with updated version
 */
export function updateStorageDataVersion<TState>(
  storage: BlockStorage<TState>,
  version: string,
): BlockStorage<TState> {
  return { ...storage, __dataVersion: version };
}

/**
 * Storage debug view returned by __pl_storage_debugView callback.
 * Used by developer tools to display block storage info.
 */
export interface StorageDebugView {
  /** Current data version key */
  dataVersion: string;
  /** Raw data payload stored in BlockStorage */
  data: unknown;
}

// =============================================================================
// Plugin Data Functions (Internal - for migration)
// =============================================================================

/**
 * Gets all plugin entries from BlockStorage (for migration)
 *
 * @param storage - The BlockStorage instance
 * @returns Record of plugin entries keyed by pluginId (empty object if not set)
 */
export function getPlugins(storage: BlockStorage): Record<string, VersionedData<unknown>> {
  return storage.__plugins ?? {};
}

/**
 * Sets all plugin entries in BlockStorage (for migration, immutable)
 *
 * @param storage - The current BlockStorage
 * @param plugins - Record of plugin entries keyed by pluginId
 * @returns A new BlockStorage with updated plugins
 */
export function setPlugins<TState>(
  storage: BlockStorage<TState>,
  plugins: Record<string, VersionedData<unknown>>,
): BlockStorage<TState> {
  return {
    ...storage,
    __plugins: plugins,
  };
}

// =============================================================================
// Atomic Migration
// =============================================================================

/**
 * Result of a successful atomic migration.
 */
export interface MigrationSuccess<TState> {
  success: true;
  /** The fully migrated storage - commit this to persist */
  storage: BlockStorage<TState>;
  /** Warnings from migrations (non-fatal issues) */
  warnings: string[];
}

/**
 * Result of a failed atomic migration.
 * The original storage is untouched - user must choose to abort or reset.
 */
export interface MigrationFailure {
  success: false;
  /** Description of what failed */
  error: string;
  /** Which step failed: 'block' or pluginId */
  failedAt: string;
}

export type MigrationResult<TState> = MigrationSuccess<TState> | MigrationFailure;

/**
 * Migration function type for block data.
 * Returns the migrated data and new version, or throws on unrecoverable error.
 */
export type BlockDataMigrateFn<TState> = (
  data: unknown,
  fromVersion: string,
) => { data: TState; version: string };

/**
 * Migration function type for plugin data.
 * Returns the migrated plugin entry, or undefined to remove the plugin.
 * Throws on unrecoverable error.
 */
export type PluginDataMigrateFn = (
  pluginId: string,
  pluginName: PluginName,
  entry: VersionedData<unknown>,
) => VersionedData<unknown> | undefined;

/**
 * Configuration for atomic block storage migration.
 */
export interface MigrateBlockStorageConfig<TState> {
  /** Function to migrate block data */
  migrateBlockData: BlockDataMigrateFn<TState>;
  /** Function to migrate each plugin's data */
  migratePluginData: PluginDataMigrateFn;
  /** The new plugin registry after migration (pluginId -> pluginName) */
  newPluginRegistry: PluginRegistry;
  /** Factory to create initial data for new plugins */
  createPluginData: (pluginId: string, pluginName: PluginName) => VersionedData<unknown>;
}

/**
 * Performs atomic migration of block storage including block data and all plugins.
 *
 * Migration is atomic: either everything succeeds and a new storage is returned,
 * or an error is returned and the original storage is completely untouched.
 *
 * Migration steps:
 * 1. Migrate block data
 * 2. For each plugin in newPluginRegistry:
 *    - If plugin exists with same name: migrate its data
 *    - If plugin exists with different name: reset to initial data (type changed)
 *    - If plugin is new: create with initial data
 * 3. Remove plugins not in newPluginRegistry (orphaned)
 *
 * If any step throws, migration fails and original storage is preserved.
 * User can then choose to:
 * - Abort: keep original storage, don't update block
 * - Reset: call createBlockStorage() to start fresh
 *
 * @param storage - The original storage (will not be modified)
 * @param config - Migration configuration
 * @returns Migration result - either success with new storage, or failure with error info
 *
 * @example
 * const result = migrateBlockStorage(storage, {
 *   migrateBlockData: (data, fromVersion) => {
 *     const migrated = blockDataModel.migrate({ version: fromVersion, data });
 *     return { data: migrated.data, version: migrated.version };
 *   },
 *   migratePluginData: (pluginId, pluginName, entry) => {
 *     const model = getPluginModel(pluginName);
 *     const migrated = model.migrate({ version: entry.__dataVersion, data: entry.__data });
 *     return { __dataVersion: migrated.version, __data: migrated.data };
 *   },
 *   newPluginRegistry: { table1: 'dataTable' as PluginName },
 *   createPluginData: (pluginId, pluginName) => {
 *     const model = getPluginModel(pluginName);
 *     const initial = model.getDefaultData();
 *     return { __dataVersion: initial.version, __data: initial.data };
 *   },
 * });
 *
 * if (result.success) {
 *   commitStorage(result.storage);
 * } else {
 *   const userChoice = await askUser(`Migration failed: ${result.error}. Reset data?`);
 *   if (userChoice === 'reset') {
 *     commitStorage(createBlockStorage(initialData, currentVersion));
 *   }
 *   // else: abort, keep original
 * }
 */
export function migrateBlockStorage<TState>(
  storage: BlockStorage<unknown>,
  config: MigrateBlockStorageConfig<TState>,
): MigrationResult<TState> {
  const { migrateBlockData, migratePluginData, newPluginRegistry, createPluginData } = config;
  const warnings: string[] = [];

  // Step 1: Migrate block data
  let migratedData: TState;
  let newVersion: string;
  try {
    const result = migrateBlockData(storage.__data, storage.__dataVersion);
    migratedData = result.data;
    newVersion = result.version;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      failedAt: 'block',
    };
  }

  // Step 2: Migrate plugins
  const oldPlugins = storage.__plugins ?? {};
  const oldRegistry = storage.__pluginRegistry ?? {};
  const newPlugins: Record<string, VersionedData<unknown>> = {};

  for (const [pluginId, pluginName] of Object.entries(newPluginRegistry)) {
    const existingEntry = oldPlugins[pluginId];
    const existingName = oldRegistry[pluginId];

    try {
      if (existingEntry && existingName === pluginName) {
        // Plugin exists with same type - migrate its data
        const migrated = migratePluginData(pluginId, pluginName, existingEntry);
        if (migrated) {
          newPlugins[pluginId] = migrated;
        }
        // If undefined returned, plugin is intentionally removed
      } else if (existingEntry && existingName !== pluginName) {
        // Plugin exists but type changed - reset to initial
        warnings.push(`Plugin '${pluginId}' type changed from '${existingName}' to '${pluginName}', data reset`);
        newPlugins[pluginId] = createPluginData(pluginId, pluginName);
      } else {
        // New plugin - create with initial data
        newPlugins[pluginId] = createPluginData(pluginId, pluginName);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        failedAt: pluginId,
      };
    }
  }

  // Log orphaned plugins (in old registry but not in new)
  for (const pluginId of Object.keys(oldRegistry)) {
    if (!(pluginId in newPluginRegistry)) {
      warnings.push(`Plugin '${pluginId}' removed (no longer in registry)`);
    }
  }

  // Step 3: Build final storage atomically
  const migratedStorage: BlockStorage<TState> = {
    [BLOCK_STORAGE_KEY]: BLOCK_STORAGE_SCHEMA_VERSION,
    __dataVersion: newVersion,
    __data: migratedData,
    __pluginRegistry: newPluginRegistry,
    __plugins: newPlugins,
  };

  return {
    success: true,
    storage: migratedStorage,
    warnings,
  };
}

/**
 * Gets plugin-specific data from BlockStorage (for UI)
 *
 * @param storage - The BlockStorage instance
 * @param pluginId - The plugin instance id
 * @returns The plugin data or undefined if not set
 */
export function getPluginData<TData = unknown>(
  storage: BlockStorage,
  pluginId: string,
): TData | undefined {
  const pluginEntry = storage.__plugins?.[pluginId];
  if (!pluginEntry) return undefined;
  return pluginEntry.__data as TData;
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
    fromVersion: string,
    toVersion: string,
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
    _fromVersion: string,
    toVersion: string,
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
