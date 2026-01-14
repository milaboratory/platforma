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
 * Used when setState is called from the frontend.
 *
 * @param currentStorageJson - Current storage as JSON string (or undefined for new blocks)
 * @param newState - New state from developer
 * @returns Updated storage as JSON string
 */
function applyStorageUpdate(currentStorageJson: string | undefined, newState: unknown): string {
  let currentStorage: BlockStorage;

  if (currentStorageJson === undefined || currentStorageJson === null || currentStorageJson === '') {
    currentStorage = createBlockStorage({});
  } else {
    const { storage } = normalizeStorage(currentStorageJson);
    currentStorage = storage;
  }

  // Update data while preserving other storage fields (version, plugins)
  const updatedStorage = updateStorageData(currentStorage, newState);

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
 */
export interface MigrationResult {
  /** Whether migrations were applied */
  migrated: boolean;
  /** New storage JSON string (only present if migrated === true) */
  newStorageJson?: string;
  /** Error message if migration failed (only present on error) */
  error?: string;
  /** Human-readable info for logging */
  info: string;
}

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
 * @param currentStorageJson - Current storage as JSON string (or undefined)
 * @returns MigrationResult with new storage or skip/error info
 */
function migrateStorage(currentStorageJson: string | undefined): MigrationResult {
  // Get migration count from callback registry
  const migrationCount = getCallbackCount('migrations');

  // No migrations defined
  if (migrationCount === undefined || migrationCount === 0) {
    return {
      migrated: false,
      info: 'No migrations defined',
    };
  }

  // Normalize storage to get current data and version
  const { storage: currentStorage, data: currentData } = normalizeStorage(currentStorageJson);
  const currentVersion = currentStorage.__dataVersion;

  // Calculate target version: initial is 1, each migration adds 1
  const targetVersion = 1 + migrationCount;

  // Check if migrations are needed
  if (currentVersion >= targetVersion) {
    return {
      migrated: false,
      info: `No migrations needed: version ${currentVersion} >= target ${targetVersion}`,
    };
  }

  // Get the callback registry context to run migrations
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) {
    return {
      migrated: false,
      error: 'Not in config rendering context',
      info: 'Migration failed: not in config rendering context',
    };
  }

  const migrationsDispatcher = ctx.callbackRegistry['migrations'];
  if (typeof migrationsDispatcher !== 'function') {
    return {
      migrated: false,
      error: 'Migrations dispatcher not found',
      info: 'Migration failed: migrations dispatcher not found',
    };
  }

  // Run migrations sequentially
  let data = currentData;
  const migrationsRun: string[] = [];

  for (let version = currentVersion; version < targetVersion; version++) {
    const migrationIndex = version - 1;

    // Skip invalid migration indices (e.g., version 0 would need migration[-1])
    if (migrationIndex < 0) {
      return {
        migrated: false,
        error: `Invalid migration index ${migrationIndex} for version ${version}`,
        info: `Migration failed: cannot migrate from version ${version} (no migration[${migrationIndex}])`,
      };
    }

    try {
      data = migrationsDispatcher(migrationIndex, data);
      migrationsRun.push(`v${version}→v${version + 1}`);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return {
        migrated: false,
        error: `Migration[${migrationIndex}] failed: ${errorMsg}`,
        info: `Migration failed at v${version}→v${version + 1}: ${errorMsg}`,
      };
    }
  }

  // Build new storage by updating data and version in current storage
  const newStorage = {
    ...currentStorage,
    __dataVersion: targetVersion,
    __data: data,
  };

  return {
    migrated: true,
    newStorageJson: JSON.stringify(newStorage),
    info: `Migrated ${migrationsRun.join(', ')} (v${currentVersion}→v${targetVersion})`,
  };
}

// Register migrate callback
tryRegisterCallback('__storage_migrate', (currentStorageJson: string | undefined) => {
  return migrateStorage(currentStorageJson);
});

// Export discriminator key and schema version for external checks
export { BLOCK_STORAGE_KEY, BLOCK_STORAGE_SCHEMA_VERSION };
