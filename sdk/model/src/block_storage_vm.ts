/**
 * BlockStorage VM Integration - Internal module for VM-based storage operations.
 *
 * Registers facade callbacks (see BlockStorageFacadeCallbacks) that the middle layer
 * invokes via executeSingleLambda(). Also defines BlockPrivateCallbacks used for
 * intra-block-pack communication with BlockModelV3.
 *
 * @module block_storage_vm
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
import { tryGetCfgRenderCtx, tryRegisterCallback } from "./internal";
import type { DataMigrationResult, DataVersioned } from "./block_migrations";
import { BlockStorageFacadeCallbacks, registerFacadeCallbacks } from "./block_storage_facade";

/** Registered in BlockModelV3._done(). */
export const BlockPrivateCallbacks = {
  BlockDataMigrate: "blockData_migrate",
  BlockDataInit: "blockData_init",
  PluginRegistry: "pluginRegistry",
  PluginDataMigrate: "pluginData_migrate",
  PluginDataInit: "pluginData_init",
} as const;

/** Type signatures for BlockPrivateCallbacks. */
export interface BlockPrivateCallbackTypes {
  [BlockPrivateCallbacks.BlockDataMigrate]: (
    versioned: DataVersioned<unknown>,
  ) => DataMigrationResult<unknown>;
  [BlockPrivateCallbacks.BlockDataInit]: () => DataVersioned<unknown>;
  [BlockPrivateCallbacks.PluginRegistry]: () => PluginRegistry;
  [BlockPrivateCallbacks.PluginDataMigrate]: (
    pluginId: string,
    versioned: DataVersioned<unknown>,
  ) => DataMigrationResult<unknown> | undefined;
  [BlockPrivateCallbacks.PluginDataInit]: (pluginId: string) => DataVersioned<unknown>;
}

/** Register all private callbacks at once. Ensures all required callbacks are provided. */
export function registerPrivateCallbacks(callbacks: BlockPrivateCallbackTypes): void {
  for (const key of Object.values(BlockPrivateCallbacks)) {
    tryRegisterCallback(key, callbacks[key] as (...args: any[]) => any);
  }
}

/** Typed callback lookup — throws if not registered. */
function getPrivateCallback<K extends keyof BlockPrivateCallbackTypes>(
  ctx: { callbackRegistry: Record<string, unknown> },
  key: K,
): BlockPrivateCallbackTypes[K] {
  const cb = ctx.callbackRegistry[key];
  if (!cb) throw new Error(`${key} callback not registered`);
  return cb as BlockPrivateCallbackTypes[K];
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
function applyStorageUpdate(
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
function getStorageDebugView(rawStorage: unknown): StringifiedJson<StorageDebugView> {
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
 * Runs storage migration using DataModel callbacks from the callback registry.
 * This is the main entry point for the middle layer to trigger migrations.
 *
 * Uses registered private callbacks for block data and plugin data.
 * Handles plugin migrations atomically using migrateBlockStorage().
 *
 * @param currentStorageJson - Current storage as JSON string (or undefined)
 * @returns MigrationResult
 */
function migrateStorage(currentStorageJson: string | undefined): MigrationResult {
  const ctx = tryGetCfgRenderCtx();
  if (!ctx) return { error: "Not in config rendering context" };

  // Normalize current storage
  const { storage: currentStorage } = normalizeStorage(currentStorageJson);

  // Get callbacks from registry
  const migrate = getPrivateCallback(ctx, BlockPrivateCallbacks.BlockDataMigrate);
  const getPluginRegistry = getPrivateCallback(ctx, BlockPrivateCallbacks.PluginRegistry);
  const pluginMigrate = getPrivateCallback(ctx, BlockPrivateCallbacks.PluginDataMigrate);
  const pluginInit = getPrivateCallback(ctx, BlockPrivateCallbacks.PluginDataInit);

  const newPluginRegistry = getPluginRegistry();

  // Perform atomic migration of block + all plugins
  const migrationResult = migrateBlockStorage(currentStorage, {
    migrateBlockData: migrate,
    migratePluginData: pluginMigrate,
    newPluginRegistry,
    createPluginData: pluginInit,
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
 * Uses registered DataModel callbacks and plugin models from the render context.
 *
 * Used by __pl_storage_initial and available as a reset path via the middle layer's
 * resetToInitialStorage().
 */
function createInitialStorage(): StringifiedJson<BlockStorage> {
  const ctx = tryGetCfgRenderCtx();
  if (!ctx) throw new Error("Not in config rendering context");

  const getDefaultData = getPrivateCallback(ctx, BlockPrivateCallbacks.BlockDataInit);
  const getPluginRegistry = getPrivateCallback(ctx, BlockPrivateCallbacks.PluginRegistry);
  const pluginInit = getPrivateCallback(ctx, BlockPrivateCallbacks.PluginDataInit);

  const blockDefault = getDefaultData();
  const pluginRegistry = getPluginRegistry();

  const plugins: Record<string, VersionedData<unknown>> = {};
  for (const pluginId of Object.keys(pluginRegistry)) {
    const initial = pluginInit(pluginId);
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
 * Derives args from storage using the registered 'args' callback.
 * This extracts data from storage and passes it to the block's args() function.
 *
 * @param storageJson - Storage as JSON string
 * @returns ArgsDeriveResult with derived args or error
 */
function deriveArgsFromStorage(storageJson: string): ArgsDeriveResult {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) {
    return { error: "Not in config rendering context" };
  }

  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Get the args callback (registered by BlockModelV3.args())
  const argsCallback = ctx.callbackRegistry["args"] as ((data: unknown) => unknown) | undefined;
  if (typeof argsCallback !== "function") {
    return { error: "args callback not found" };
  }

  // Call the args callback with extracted data
  try {
    const result = argsCallback(data);
    return { value: result };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `args() threw: ${errorMsg}` };
  }
}

/**
 * Derives prerunArgs from storage using the registered 'prerunArgs' callback.
 * Falls back to 'args' callback if 'prerunArgs' is not defined.
 *
 * @param storageJson - Storage as JSON string
 * @returns ArgsDeriveResult with derived prerunArgs or error
 */
function derivePrerunArgsFromStorage(storageJson: string): ArgsDeriveResult {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) {
    return { error: "Not in config rendering context" };
  }

  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Try prerunArgs callback first
  const prerunArgsCallback = ctx.callbackRegistry["prerunArgs"] as
    | ((data: unknown) => unknown)
    | undefined;
  if (typeof prerunArgsCallback === "function") {
    try {
      const result = prerunArgsCallback(data);
      return { value: result };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { error: `prerunArgs() threw: ${errorMsg}` };
    }
  }

  // Fall back to args callback
  const argsCallback = ctx.callbackRegistry["args"] as ((data: unknown) => unknown) | undefined;
  if (typeof argsCallback !== "function") {
    return { error: "args callback not found (fallback from missing prerunArgs)" };
  }

  try {
    const result = argsCallback(data);
    return { value: result };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `args() threw (fallback): ${errorMsg}` };
  }
}

// =============================================================================
// Auto-register facade callbacks when module is loaded in VM
// =============================================================================

registerFacadeCallbacks({
  [BlockStorageFacadeCallbacks.StorageApplyUpdate]: applyStorageUpdate,
  [BlockStorageFacadeCallbacks.StorageDebugView]: getStorageDebugView,
  [BlockStorageFacadeCallbacks.StorageMigrate]: migrateStorage,
  [BlockStorageFacadeCallbacks.StorageInitial]: createInitialStorage,
  [BlockStorageFacadeCallbacks.ArgsDerive]: deriveArgsFromStorage,
  [BlockStorageFacadeCallbacks.PrerunArgsDerive]: derivePrerunArgsFromStorage,
});

// Export discriminator key and schema version for external checks
export { BLOCK_STORAGE_KEY, BLOCK_STORAGE_SCHEMA_VERSION };
