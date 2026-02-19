/**
 * BlockStorage Callback Implementations - wired to facade callbacks in BlockModelV3._done().
 *
 * Provides pure functions for storage operations (migration, initialization,
 * args derivation, updates, debug views). Each function takes its dependencies
 * explicitly as parameters.
 *
 * @module block_storage_callbacks
 * @internal
 */

import {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  type BlockStorage,
  type MutateStoragePayload,
  type StorageDebugView,
  type PluginRegistry,
  type VersionedData,
  createBlockStorage,
  getStorageData,
  isBlockStorage,
  migrateBlockStorage,
  normalizeBlockStorage,
  updateStorageData,
} from "./block_storage";

import { stringifyJson, type StringifiedJson } from "@milaboratories/pl-model-common";
import type { DataMigrationResult, DataVersioned } from "./block_migrations";

// =============================================================================
// Hook interfaces for dependency injection
// =============================================================================

/** Dependencies for storage migration */
export interface MigrationHooks {
  migrateBlockData: (versioned: DataVersioned<unknown>) => DataMigrationResult<unknown>;
  getPluginRegistry: () => PluginRegistry;
  migratePluginData: (
    pluginId: string,
    versioned: DataVersioned<unknown>,
  ) => DataMigrationResult<unknown> | undefined;
  createPluginData: (pluginId: string) => DataVersioned<unknown>;
}

/** Dependencies for initial storage creation */
export interface InitialStorageHooks {
  getDefaultBlockData: () => DataVersioned<unknown>;
  getPluginRegistry: () => PluginRegistry;
  createPluginData: (pluginId: string) => DataVersioned<unknown>;
}

/**
 * Result of storage normalization
 */
export interface NormalizeStorageResult {
  /** The normalized BlockStorage object */
  storage: BlockStorage;
  /** The extracted data (what developers see) */
  data: unknown;
}

/**
 * Normalizes raw storage data and extracts state.
 * Handles all formats:
 * - New BlockStorage format (has discriminator)
 * - Legacy V1/V2 format ({ args, uiState })
 * - Raw V3 state (any other format)
 *
 * @param rawStorage - Raw data from blockStorage field (may be JSON string or object)
 * @returns Object with normalized storage and extracted state
 */
function normalizeStorage(rawStorage: unknown): NormalizeStorageResult {
  // Handle undefined/null
  if (rawStorage === undefined || rawStorage === null) {
    const storage = createBlockStorage({});
    return { storage, data: {} };
  }

  // Parse JSON string if needed
  let parsed = rawStorage;
  if (typeof rawStorage === "string") {
    try {
      parsed = JSON.parse(rawStorage);
    } catch {
      // If parsing fails, treat string as the data
      const storage = createBlockStorage(rawStorage);
      return { storage, data: rawStorage };
    }
  }

  // Check for BlockStorage format (has discriminator)
  if (isBlockStorage(parsed)) {
    const storage = normalizeBlockStorage(parsed);
    return { storage, data: getStorageData(storage) };
  }

  // Check for legacy V1/V2 format: { args, uiState }
  if (isLegacyModelV1ApiFormat(parsed)) {
    // For legacy format, the whole object IS the data
    const storage = createBlockStorage(parsed);
    return { storage, data: parsed };
  }

  // Raw V3 data - wrap it
  const storage = createBlockStorage(parsed);
  return { storage, data: parsed };
}

/**
 * Applies a state update to existing storage.
 * Used when setData is called from the frontend.
 *
 * @param currentStorageJson - Current storage as JSON string (must be defined)
 * @param payload - Update payload with operation type and value
 * @returns Updated storage as StringifiedJson<BlockStorage>
 */
export function applyStorageUpdate(
  currentStorageJson: string,
  payload: MutateStoragePayload,
): StringifiedJson<BlockStorage> {
  const { storage: currentStorage } = normalizeStorage(currentStorageJson);

  // Update data while preserving other storage fields (version, plugins)
  const updatedStorage = updateStorageData(currentStorage, payload);

  return stringifyJson(updatedStorage);
}

/**
 * Checks if data is in legacy Model API v1 format.
 * Legacy format has { args, uiState? } at top level without the BlockStorage discriminator.
 */
function isLegacyModelV1ApiFormat(data: unknown): data is { args?: unknown } {
  if (data === null || typeof data !== "object") return false;
  if (isBlockStorage(data)) return false;

  const obj = data as Record<string, unknown>;
  return "args" in obj;
}

// =============================================================================
// Facade Callback Implementations
// =============================================================================

/**
 * Gets storage debug view from raw storage data.
 * Returns structured debug info about the storage state.
 *
 * @param rawStorage - Raw data from blockStorage field (may be JSON string or object)
 * @returns JSON string with storage debug view
 */
export function getStorageDebugView(rawStorage: unknown): StringifiedJson<StorageDebugView> {
  const { storage } = normalizeStorage(rawStorage);
  const debugView: StorageDebugView = {
    dataVersion: storage.__dataVersion,
    data: storage.__data,
  };
  return stringifyJson(debugView);
}

// =============================================================================
// Migration Support
// =============================================================================

/**
 * Result of storage migration.
 * Returned by __pl_storage_migrate callback.
 *
 * - Error result: { error: string } - serious failure (no context, etc.)
 * - Success result: { newStorageJson: StringifiedJson<BlockStorage>, info: string } - migration succeeded
 */
export type MigrationResult =
  | { error: string }
  | { error?: undefined; newStorageJson: StringifiedJson<BlockStorage>; info: string };

/**
 * Runs storage migration using the provided hooks.
 * This is the main entry point for the middle layer to trigger migrations.
 *
 * @param currentStorageJson - Current storage as JSON string (or undefined)
 * @param hooks - Migration dependencies (block/plugin data migration and creation functions)
 * @returns MigrationResult
 */
export function migrateStorage(
  currentStorageJson: string | undefined,
  hooks: MigrationHooks,
): MigrationResult {
  // Normalize current storage
  const { storage: currentStorage } = normalizeStorage(currentStorageJson);

  const newPluginRegistry = hooks.getPluginRegistry();

  // Perform atomic migration of block + all plugins
  const migrationResult = migrateBlockStorage(currentStorage, {
    migrateBlockData: hooks.migrateBlockData,
    migratePluginData: hooks.migratePluginData,
    newPluginRegistry,
    createPluginData: hooks.createPluginData,
  });

  if (!migrationResult.success) {
    return {
      error: `Migration failed at '${migrationResult.failedAt}': ${migrationResult.error}`,
    };
  }

  // Build info message
  const oldVersion = currentStorage.__dataVersion;
  const newVersion = migrationResult.storage.__dataVersion;
  const info =
    oldVersion === newVersion
      ? `No migration needed (${oldVersion})`
      : `Migrated ${oldVersion} -> ${newVersion}`;

  return {
    newStorageJson: stringifyJson(migrationResult.storage),
    info,
  };
}

// =============================================================================
// Initial Storage Creation
// =============================================================================

/**
 * Creates complete initial storage (block data + all plugin data) atomically.
 *
 * @param hooks - Dependencies for creating initial block and plugin data
 * @returns Initial storage as branded JSON string
 */
export function createInitialStorage(hooks: InitialStorageHooks): StringifiedJson<BlockStorage> {
  const blockDefault = hooks.getDefaultBlockData();
  const pluginRegistry = hooks.getPluginRegistry();

  const plugins: Record<string, VersionedData<unknown>> = {};
  for (const pluginId of Object.keys(pluginRegistry)) {
    const initial = hooks.createPluginData(pluginId);
    plugins[pluginId] = { __dataVersion: initial.version, __data: initial.data };
  }

  const storage: BlockStorage = {
    [BLOCK_STORAGE_KEY]: BLOCK_STORAGE_SCHEMA_VERSION,
    __dataVersion: blockDefault.version,
    __data: blockDefault.data,
    __pluginRegistry: pluginRegistry,
    __plugins: plugins,
  };
  return stringifyJson(storage);
}

// =============================================================================
// Args Derivation from Storage
// =============================================================================

/**
 * Result of args derivation from storage.
 * Returned by __pl_args_derive and __pl_prerunArgs_derive callbacks.
 */
export type ArgsDeriveResult = { error: string } | { error?: undefined; value: unknown };

/**
 * Derives args from storage using the provided args function.
 * This extracts data from storage and passes it to the block's args() function.
 *
 * @param storageJson - Storage as JSON string
 * @param argsFunction - The block's args derivation function
 * @returns ArgsDeriveResult with derived args or error
 */
export function deriveArgsFromStorage(
  storageJson: string,
  argsFunction: (data: unknown) => unknown,
): ArgsDeriveResult {
  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Call the args function with extracted data
  try {
    const result = argsFunction(data);
    return { value: result };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `args() threw: ${errorMsg}` };
  }
}

/**
 * Derives prerunArgs from storage.
 * Uses prerunArgsFunction if provided, otherwise falls back to argsFunction.
 *
 * @param storageJson - Storage as JSON string
 * @param argsFunction - The block's args derivation function (fallback)
 * @param prerunArgsFunction - Optional prerun args derivation function
 * @returns ArgsDeriveResult with derived prerunArgs or error
 */
export function derivePrerunArgsFromStorage(
  storageJson: string,
  argsFunction: (data: unknown) => unknown,
  prerunArgsFunction?: (data: unknown) => unknown,
): ArgsDeriveResult {
  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Try prerunArgs function first if available
  if (prerunArgsFunction) {
    try {
      const result = prerunArgsFunction(data);
      return { value: result };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { error: `prerunArgs() threw: ${errorMsg}` };
    }
  }

  // Fall back to args function
  try {
    const result = argsFunction(data);
    return { value: result };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `args() threw (fallback): ${errorMsg}` };
  }
}

// Export discriminator key and schema version for external checks
export { BLOCK_STORAGE_KEY, BLOCK_STORAGE_SCHEMA_VERSION };
