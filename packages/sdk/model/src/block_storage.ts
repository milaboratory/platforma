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

import type { Branded } from "@milaboratories/pl-model-common";
import type { DataMigrationResult, DataVersioned } from "./block_migrations";

// =============================================================================
// Core Types
// =============================================================================

/**
 * Discriminator key for BlockStorage format detection.
 * This unique hash-based key identifies data as BlockStorage vs legacy formats.
 */
export const BLOCK_STORAGE_KEY = "__pl_a7f3e2b9__";

/**
 * Current BlockStorage schema version.
 * Increment this when the storage structure itself changes (not block state migrations).
 */
export const BLOCK_STORAGE_SCHEMA_VERSION = "v1";

/**
 * Default data version for new blocks without migrations.
 * Unique identifier ensures blocks are created via DataModel API.
 */
export const DATA_MODEL_DEFAULT_VERSION = "__pl_v1_d4e8f2a1__";

/**
 * Type for valid schema versions
 */
export type BlockStorageSchemaVersion = "v1"; // Add 'v2', 'v3', etc. as schema evolves

/**
 * Branded type for plugin names - globally unique plugin type identifiers.
 * Using a branded type enforces explicit casting (`as PluginName`) which makes
 * it easy to find all plugin name definitions in the codebase and verify uniqueness.
 */
export type PluginName = Branded<string, "PluginName">;

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
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const schemaVersion = obj[BLOCK_STORAGE_KEY];
  // Currently only 'v1' is valid, but this allows future versions
  return schemaVersion === "v1"; // Add more versions as schema evolves
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
      __dataVersion:
        typeof storage.__dataVersion === "number"
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
export function deriveDataFromStorage<TData = unknown>(rawStorage: unknown): TData {
  // Normalize to BlockStorage format (handles legacy formats too)
  const storage = normalizeBlockStorage<TData>(rawStorage);
  return getStorageData(storage);
}

/** Payload for storage mutation operations. SDK defines specific operations. */
export type MutateStoragePayload<T = unknown> =
  | { operation: "update-block-data"; value: T }
  | { operation: "update-plugin-data"; pluginId: string; value: unknown };

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
    case "update-block-data":
      return { ...storage, __data: payload.value };
    case "update-plugin-data": {
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
// Atomic Migration
// =============================================================================

/**
 * Result of a successful atomic migration.
 */
export interface MigrationSuccess<TState> {
  success: true;
  /** The fully migrated storage - commit this to persist */
  storage: BlockStorage<TState>;
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
 * Configuration for atomic block storage migration.
 * Callbacks use DataVersioned format (the DataModel API format).
 * Conversion to internal VersionedData format is handled by migrateBlockStorage().
 */
export interface MigrateBlockStorageConfig {
  /** Migrate block data from any version to latest */
  migrateBlockData: (versioned: DataVersioned<unknown>) => DataMigrationResult<unknown>;
  /** Migrate each plugin's data. Return undefined to remove the plugin. */
  migratePluginData: (
    pluginId: string,
    versioned: DataVersioned<unknown>,
  ) => DataMigrationResult<unknown> | undefined;
  /** The new plugin registry after migration (pluginId -> pluginName) */
  newPluginRegistry: PluginRegistry;
  /** Factory to create initial data for new plugins */
  createPluginData: (pluginId: string) => DataVersioned<unknown>;
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
 *    - Otherwise (new or type changed): create with initial data
 *    Plugins not in newPluginRegistry are dropped.
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
 *   migrateBlockData: (versioned) => blockDataModel.migrate(versioned),
 *   migratePluginData: (pluginId, versioned) => getPluginModel(pluginId).migrate(versioned),
 *   newPluginRegistry: { table1: 'dataTable' as PluginName },
 *   createPluginData: (pluginId) => getPluginModel(pluginId).getDefaultData(),
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
export function migrateBlockStorage(
  storage: BlockStorage<unknown>,
  config: MigrateBlockStorageConfig,
): MigrationResult<unknown> {
  const { migrateBlockData, migratePluginData, newPluginRegistry, createPluginData } = config;

  // Step 1: Migrate block data
  let migratedData: unknown;
  let newVersion: string;
  try {
    const result = migrateBlockData({ version: storage.__dataVersion, data: storage.__data });
    migratedData = result.data;
    newVersion = result.version;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      failedAt: "block",
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
        const migrated = migratePluginData(pluginId, {
          version: existingEntry.__dataVersion,
          data: existingEntry.__data,
        });
        if (migrated) {
          newPlugins[pluginId] = { __dataVersion: migrated.version, __data: migrated.data };
        }
        // If undefined returned, plugin is intentionally removed
      } else {
        // New plugin or type changed - create with initial data
        const initial = createPluginData(pluginId);
        newPlugins[pluginId] = { __dataVersion: initial.version, __data: initial.data };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        failedAt: pluginId,
      };
    }
  }

  // Step 3: Build final storage atomically
  const migratedStorage: BlockStorage = {
    [BLOCK_STORAGE_KEY]: BLOCK_STORAGE_SCHEMA_VERSION,
    __dataVersion: newVersion,
    __data: migratedData,
    __pluginRegistry: newPluginRegistry,
    __plugins: newPlugins,
  };

  return {
    success: true,
    storage: migratedStorage,
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
