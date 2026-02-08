/**
 * BlockStorage VM Integration - Internal module for VM-based storage operations.
 *
 * This module auto-registers internal callbacks that the middle layer can invoke
 * to perform storage transformations. Block developers never interact with these
 * directly - they only see `state`.
 *
 * Registered callbacks (all prefixed with `__pl_` for internal SDK use):
 * - `__pl_storage_applyUpdate`: (currentStorageJson, payload) => updatedStorageJson
 * - `__pl_storage_debugView`: (rawStorage) => JSON string with storage debug view
 * - `__pl_storage_migrate`: (currentStorageJson) => MigrationResult
 * - `__pl_args_derive`: (storageJson) => ArgsDeriveResult
 * - `__pl_prerunArgs_derive`: (storageJson) => ArgsDeriveResult
 *
 * Callbacks registered by DataModel.registerCallbacks():
 * - `__pl_data_initial`: () => initial data
 * - `__pl_data_upgrade`: (versioned) => DataMigrationResult
 * - `__pl_storage_initial`: () => initial BlockStorage as JSON string
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
  createBlockStorage,
  getStorageData,
  isBlockStorage,
  normalizeBlockStorage,
  updateStorageData,
} from "./block_storage";
import { stringifyJson, type StringifiedJson } from "@milaboratories/pl-model-common";
import { tryGetCfgRenderCtx, tryRegisterCallback } from "./internal";

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
 * @param newData - New data from application
 * @returns Updated storage as JSON string
 */
function applyStorageUpdate(currentStorageJson: string, payload: MutateStoragePayload): string {
  const { storage: currentStorage } = normalizeStorage(currentStorageJson);

  // Update data while preserving other storage fields (version, plugins)
  const updatedStorage = updateStorageData(currentStorage, payload);

  return JSON.stringify(updatedStorage);
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
// Auto-register internal callbacks when module is loaded in VM
// =============================================================================

// Register apply update callback (requires existing storage)
tryRegisterCallback(
  "__pl_storage_applyUpdate",
  (currentStorageJson: string, payload: MutateStoragePayload) => {
    return applyStorageUpdate(currentStorageJson, payload);
  },
);

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

// Register debug view callback
tryRegisterCallback("__pl_storage_debugView", (rawStorage: unknown) => {
  return getStorageDebugView(rawStorage);
});

// =============================================================================
// Migration Support
// =============================================================================

/**
 * Result of storage migration.
 * Returned by __pl_storage_migrate callback.
 *
 * - Error result: { error: string } - serious failure (no context, etc.)
 * - Success result: { newStorageJson: string, info: string, warn?: string } - migration succeeded or reset to initial
 */
export type MigrationResult =
  | { error: string }
  | { error?: undefined; newStorageJson: string; info: string; warn?: string };

/** Result from DataModel.migrate() */
interface DataMigrationResult {
  version: string;
  data: unknown;
  warning?: string;
}

/**
 * Runs storage migration using the DataModel's migrate callback.
 * This is the main entry point for the middle layer to trigger migrations.
 *
 * Uses the '__pl_data_upgrade' callback registered by DataModel.registerCallbacks() which:
 * - Handles all migration logic internally
 * - Returns { version, data, warning? } - warning present if reset to initial data
 *
 * @param currentStorageJson - Current storage as JSON string (or undefined)
 * @returns MigrationResult
 */
function migrateStorage(currentStorageJson: string | undefined): MigrationResult {
  // Get the callback registry context
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) {
    return { error: "Not in config rendering context" };
  }

  // Normalize storage to get current data and version
  const { storage: currentStorage, data: currentData } = normalizeStorage(currentStorageJson);
  const currentVersion = currentStorage.__dataVersion;

  // Helper to create storage with given data and version
  const createStorageJson = (data: unknown, version: string): string => {
    return JSON.stringify({
      ...currentStorage,
      __dataVersion: version,
      __data: data,
    });
  };

  // Get the migrate callback (registered by DataModel.registerCallbacks())
  const migrateCallback = ctx.callbackRegistry["__pl_data_upgrade"] as
    | ((v: { version: string; data: unknown }) => DataMigrationResult)
    | undefined;
  if (typeof migrateCallback !== "function") {
    return { error: "__pl_data_upgrade callback not found (DataModel not registered)" };
  }

  // Call the migrator's migrate function
  let result: DataMigrationResult;
  try {
    result = migrateCallback({ version: currentVersion, data: currentData });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `migrate() threw: ${errorMsg}` };
  }

  // Build info message
  const info =
    result.version === currentVersion
      ? `No migration needed (${currentVersion})`
      : result.warning
        ? `Reset to initial data (${result.version})`
        : `Migrated ${currentVersion}→${result.version}`;

  return {
    newStorageJson: createStorageJson(result.data, result.version),
    info,
    warn: result.warning,
  };
}

// Register migrate callback
tryRegisterCallback("__pl_storage_migrate", (currentStorageJson: string | undefined) => {
  return migrateStorage(currentStorageJson);
});

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

// Register args derivation callback
tryRegisterCallback("__pl_args_derive", (storageJson: string) => {
  return deriveArgsFromStorage(storageJson);
});

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

// Register prerunArgs derivation callback
tryRegisterCallback("__pl_prerunArgs_derive", (storageJson: string) => {
  return derivePrerunArgsFromStorage(storageJson);
});

// Export discriminator key and schema version for external checks
export { BLOCK_STORAGE_KEY, BLOCK_STORAGE_SCHEMA_VERSION };
