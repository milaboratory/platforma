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
import { getCallbackCount, tryGetCfgRenderCtx, tryRegisterCallback } from './internal';

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
 * Applies a state update to the current storage.
 * Used when setData is called from the frontend.
 *
 * @param currentStorageJson - Current storage as JSON string (or undefined for new blocks)
 * @param newData - New data from application
 * @returns Updated storage as JSON string
 */
function applyStorageUpdate(currentStorageJson: string | undefined, newData: unknown): string {
  let currentStorage: BlockStorage;

  if (currentStorageJson === undefined || currentStorageJson === null || currentStorageJson === '') {
    currentStorage = createBlockStorage({});
  } else {
    const { storage } = normalizeStorage(currentStorageJson);
    currentStorage = storage;
  }

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

// Register apply update callback
tryRegisterCallback('__storage_applyUpdate', (currentStorageJson: string | undefined, newState: unknown) => {
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

/**
 * Runs all necessary migrations on the storage.
 * This is the main entry point for the middle layer to trigger migrations.
 *
 * Migration logic:
 * - Initial state has version 1
 * - migration[0] transforms version 1 → version 2
 * - migration[1] transforms version 2 → version 3
 * - etc.
 *
 * Returns either:
 * - Success with newStorageJson (migrated, unchanged, or reset to initial with warning)
 * - Error if something seriously wrong (no context available)
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

  // Get migration count from callback registry
  const migrationCount = getCallbackCount('migrations') ?? 0;

  // Calculate target version: initial is 1, each migration adds 1
  const targetVersion = 1 + migrationCount;

  // Helper to create storage with given data and version
  const createStorageJson = (data: unknown, version: number): string => {
    return JSON.stringify({
      ...currentStorage,
      __dataVersion: version,
      __data: data,
    });
  };

  // Helper function to reset to initial data on migration failure (returns success with warning)
  const resetToInitialData = (warnMsg: string): MigrationResult => {
    const initialDataCallback = ctx.callbackRegistry['initialData'];
    if (typeof initialDataCallback !== 'function') {
      return { error: `${warnMsg}; initialData callback not found` };
    }

    try {
      const initialData = initialDataCallback();
      return {
        newStorageJson: createStorageJson(initialData, targetVersion),
        info: `Reset to initial data (v${targetVersion})`,
        warn: warnMsg,
      };
    } catch (initError) {
      const initErrorMsg = initError instanceof Error ? initError.message : String(initError);
      return { error: `${warnMsg}; initialData() also failed: ${initErrorMsg}` };
    }
  };

  // No migrations defined - return current storage with version set to target
  if (migrationCount === 0) {
    return {
      newStorageJson: createStorageJson(currentData, targetVersion),
      info: 'No migrations defined',
    };
  }

  // Check if migrations are needed
  if (currentVersion >= targetVersion) {
    return {
      newStorageJson: JSON.stringify(currentStorage),
      info: `No migration needed (v${currentVersion} >= v${targetVersion})`,
    };
  }

  const migrationsDispatcher = ctx.callbackRegistry['migrations'];
  if (typeof migrationsDispatcher !== 'function') {
    return resetToInitialData('Migrations dispatcher not found');
  }

  // Run migrations sequentially
  let data = currentData;
  const migrationsRun: string[] = [];

  for (let version = currentVersion; version < targetVersion; version++) {
    const migrationIndex = version - 1;

    // Invalid migration indices (e.g., version 0 would need migration[-1])
    if (migrationIndex < 0) {
      return resetToInitialData(`Cannot migrate from version ${version}: no migration[${migrationIndex}]`);
    }

    try {
      data = migrationsDispatcher(migrationIndex, data);
      migrationsRun.push(`v${version}→v${version + 1}`);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return resetToInitialData(`Migration v${version}→v${version + 1} failed: ${errorMsg}`);
    }
  }

  return {
    newStorageJson: createStorageJson(data, targetVersion),
    info: `Migrated ${migrationsRun.join(', ')}`,
  };
}

// Register migrate callback
tryRegisterCallback('__storage_migrate', (currentStorageJson: string | undefined) => {
  return migrateStorage(currentStorageJson);
});

// Export discriminator key and schema version for external checks
export { BLOCK_STORAGE_KEY, BLOCK_STORAGE_SCHEMA_VERSION };
