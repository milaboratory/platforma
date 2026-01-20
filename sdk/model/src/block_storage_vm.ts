/**
 * BlockStorage VM Integration - Internal module for VM-based storage operations.
 *
 * This module auto-registers internal callbacks that the middle layer can invoke
 * to perform storage transformations. Block developers never interact with these
 * directly - they only see `state`.
 *
 * Registered callbacks:
 * - `__storage_normalize`: (rawStorage) => { storage, state }
 * - `__storage_applyUpdate`: (currentStorageJson, newState) => updatedStorageJson
 * - `__storage_getInfo`: (rawStorage) => JSON string with storage info
 * - `__storage_migrate`: (currentStorageJson) => MigrationResult
 *
 * @module block_storage_vm
 * @internal
 */

import {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  type BlockStorage,
  createBlockStorage,
  getStorageData,
  isBlockStorage,
  updateStorageData,
} from './block_storage';
import { tryGetCfgRenderCtx, tryRegisterCallback } from './internal';

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
  if (typeof rawStorage === 'string') {
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
    return { storage: parsed, data: getStorageData(parsed) };
  }

  // Check for legacy V1/V2 format: { args, uiState }
  if (isLegacyV1V2Format(parsed)) {
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
function applyStorageUpdate(currentStorageJson: string, newData: unknown): string {
  const { storage: currentStorage } = normalizeStorage(currentStorageJson);

  // Update data while preserving other storage fields (version, plugins)
  const updatedStorage = updateStorageData(currentStorage, newData);

  return JSON.stringify(updatedStorage);
}

/**
 * Checks if data is in legacy V1/V2 format.
 * Legacy format has { args, uiState } at top level without the BlockStorage discriminator.
 */
function isLegacyV1V2Format(data: unknown): data is { args?: unknown; uiState?: unknown } {
  if (data === null || typeof data !== 'object') return false;
  if (isBlockStorage(data)) return false;

  const obj = data as Record<string, unknown>;
  return 'args' in obj || 'uiState' in obj;
}

// =============================================================================
// Auto-register internal callbacks when module is loaded in VM
// =============================================================================

// Register normalize callback
tryRegisterCallback('__storage_normalize', (rawStorage: unknown) => {
  return normalizeStorage(rawStorage);
});

// Register apply update callback (requires existing storage)
tryRegisterCallback('__storage_applyUpdate', (currentStorageJson: string, newState: unknown) => {
  return applyStorageUpdate(currentStorageJson, newState);
});

/**
 * Storage info result returned by __storage_getInfo callback.
 */
export interface StorageInfo {
  /** Current data version (1-based, starts at 1) */
  dataVersion: number;
}

/**
 * Gets storage info from raw storage data.
 * Returns structured info about the storage state.
 *
 * @param rawStorage - Raw data from blockStorage field (may be JSON string or object)
 * @returns JSON string with storage info
 */
function getStorageInfo(rawStorage: unknown): string {
  const { storage } = normalizeStorage(rawStorage);
  const info: StorageInfo = {
    dataVersion: storage.__dataVersion,
  };
  return JSON.stringify(info);
}

// Register get info callback
tryRegisterCallback('__storage_getInfo', (rawStorage: unknown) => {
  return getStorageInfo(rawStorage);
});

// =============================================================================
// Migration Support
// =============================================================================

/**
 * Result of storage migration.
 * Returned by __storage_migrate callback.
 *
 * - Error result: { error: string } - serious failure (no context, etc.)
 * - Success result: { newStorageJson: string, info: string, warn?: string } - migration succeeded or reset to initial
 */
export type MigrationResult =
  | { error: string }
  | { error?: undefined; newStorageJson: string; info: string; warn?: string };

/** Result from Migrator.upgrade() */
interface UpgradeResult {
  version: number;
  data: unknown;
  warning?: string;
}

/**
 * Runs storage migration using the Migrator's upgrade callback.
 * This is the main entry point for the middle layer to trigger migrations.
 *
 * Uses the 'upgrade' callback registered by Migrator.registerCallbacks() which:
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
    return { error: 'Not in config rendering context' };
  }

  // Normalize storage to get current data and version
  const { storage: currentStorage, data: currentData } = normalizeStorage(currentStorageJson);
  const currentVersion = currentStorage.__dataVersion;

  // Helper to create storage with given data and version
  const createStorageJson = (data: unknown, version: number): string => {
    return JSON.stringify({
      ...currentStorage,
      __dataVersion: version,
      __data: data,
    });
  };

  // Get the upgrade callback (registered by Migrator.registerCallbacks())
  const upgradeCallback = ctx.callbackRegistry['upgrade'] as ((v: { version: number; data: unknown }) => UpgradeResult) | undefined;
  if (typeof upgradeCallback !== 'function') {
    return { error: 'upgrade callback not found (Migrator not registered)' };
  }

  // Call the migrator's upgrade function
  let result: UpgradeResult;
  try {
    result = upgradeCallback({ version: currentVersion, data: currentData });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `upgrade() threw: ${errorMsg}` };
  }

  // Build info message
  const info = result.version === currentVersion
    ? `No migration needed (v${currentVersion})`
    : result.warning
      ? `Reset to initial data (v${result.version})`
      : `Migrated v${currentVersion}→v${result.version}`;

  return {
    newStorageJson: createStorageJson(result.data, result.version),
    info,
    warn: result.warning,
  };
}

// Register migrate callback
tryRegisterCallback('__storage_migrate', (currentStorageJson: string | undefined) => {
  return migrateStorage(currentStorageJson);
});

// =============================================================================
// Args Derivation from Storage
// =============================================================================

/**
 * Result of args derivation from storage.
 * Returned by __args_fromStorage and __preRunArgs_fromStorage callbacks.
 */
export type ArgsDeriveResult =
  | { error: string }
  | { error?: undefined; value: unknown };

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
    return { error: 'Not in config rendering context' };
  }

  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Get the args callback (registered by BlockModelV3.args())
  const argsCallback = ctx.callbackRegistry['args'] as ((data: unknown) => unknown) | undefined;
  if (typeof argsCallback !== 'function') {
    return { error: 'args callback not found' };
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

// Register args from storage callback
tryRegisterCallback('__args_fromStorage', (storageJson: string) => {
  return deriveArgsFromStorage(storageJson);
});

/**
 * Derives preRunArgs from storage using the registered 'preRunArgs' callback.
 * Falls back to 'args' callback if 'preRunArgs' is not defined.
 *
 * @param storageJson - Storage as JSON string
 * @returns ArgsDeriveResult with derived preRunArgs or error
 */
function derivePreRunArgsFromStorage(storageJson: string): ArgsDeriveResult {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) {
    return { error: 'Not in config rendering context' };
  }

  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Try preRunArgs callback first
  const preRunArgsCallback = ctx.callbackRegistry['preRunArgs'] as ((data: unknown) => unknown) | undefined;
  if (typeof preRunArgsCallback === 'function') {
    try {
      const result = preRunArgsCallback(data);
      return { value: result };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { error: `preRunArgs() threw: ${errorMsg}` };
    }
  }

  // Fall back to args callback
  const argsCallback = ctx.callbackRegistry['args'] as ((data: unknown) => unknown) | undefined;
  if (typeof argsCallback !== 'function') {
    return { error: 'args callback not found (fallback from missing preRunArgs)' };
  }

  try {
    const result = argsCallback(data);
    return { value: result };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `args() threw (fallback): ${errorMsg}` };
  }
}

// Register preRunArgs from storage callback
tryRegisterCallback('__preRunArgs_fromStorage', (storageJson: string) => {
  return derivePreRunArgsFromStorage(storageJson);
});

// Export discriminator key and schema version for external checks
export { BLOCK_STORAGE_KEY, BLOCK_STORAGE_SCHEMA_VERSION };
