/**
 * Block Storage Helper - Middle layer utilities for BlockStorage operations.
 *
 * This module provides the bridge between the SDK's BlockStorage abstraction
 * and the middle layer's storage operations. Block developers never interact
 * with this - they only see `state`.
 *
 * @module block_storage_helper
 */

import type {
  BlockStorage,
  BlockStorageHandlers,
} from '@platforma-sdk/model';
import {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  createBlockStorage,
  defaultBlockStorageHandlers,
  getPluginData,
  getStorageData,
  getStorageDataVersion,
  isBlockStorage,
  normalizeBlockStorage,
  setPluginData,
  updateStorageData,
  updateStorageDataVersion,
} from '@platforma-sdk/model';

// Re-export types for convenience
export type { BlockStorage, BlockStorageHandlers };

// Re-export utilities that middle layer needs
export {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  createBlockStorage,
  defaultBlockStorageHandlers,
  getPluginData,
  getStorageData,
  getStorageDataVersion,
  isBlockStorage,
  normalizeBlockStorage,
  setPluginData,
  updateStorageData,
  updateStorageDataVersion,
};

/**
 * Parses raw blockStorage data (from resource tree) into BlockStorage.
 * Handles both legacy format (raw state) and new format (BlockStorage).
 *
 * @param rawData - Raw data from blockStorage field (may be string or parsed object)
 * @returns Normalized BlockStorage object
 */
export function parseBlockStorage<TState = unknown>(rawData: unknown): BlockStorage<TState> {
  if (rawData === undefined || rawData === null) {
    return createBlockStorage<TState>({} as TState);
  }

  // If it's a string, parse it first
  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData);
      return normalizeBlockStorage<TState>(parsed);
    } catch {
      // If parsing fails, treat the string as the state itself
      return createBlockStorage(rawData as unknown as TState);
    }
  }

  return normalizeBlockStorage<TState>(rawData);
}

/**
 * Extracts the user-facing data from BlockStorage.
 * This is what block developers see in their .args() callbacks.
 *
 * @param storage - The BlockStorage object
 * @returns The data value that developers work with
 */
export function extractDataForDeveloper<TState>(storage: BlockStorage<TState>): TState {
  return getStorageData(storage);
}

/**
 * Creates a new BlockStorage with updated state.
 * Used when setState is called from the frontend.
 *
 * @param currentStorage - Current BlockStorage (or undefined for new blocks)
 * @param newState - New state from developer
 * @param handlers - Optional custom handlers (defaults to standard handlers)
 * @returns Updated BlockStorage
 */
export function applyStateUpdate<TState>(
  currentStorage: BlockStorage<TState> | undefined,
  newState: TState,
  handlers: BlockStorageHandlers<TState> = defaultBlockStorageHandlers as BlockStorageHandlers<TState>,
): BlockStorage<TState> {
  const storage = currentStorage ?? createBlockStorage<TState>({} as TState);
  const transform = handlers.transformStateForStorage ?? defaultBlockStorageHandlers.transformStateForStorage;
  return transform(storage, newState) as BlockStorage<TState>;
}

/**
 * Serializes BlockStorage for writing to the resource tree.
 *
 * @param storage - The BlockStorage to serialize
 * @returns JSON string
 */
export function serializeBlockStorage(storage: BlockStorage): string {
  return JSON.stringify(storage);
}

/**
 * Checks if the storage needs migration based on version.
 *
 * @param storage - Current BlockStorage
 * @param targetVersion - Target schema version
 * @returns true if migration is needed
 */
export function needsMigration(storage: BlockStorage, targetVersion: number): boolean {
  return getStorageDataVersion(storage) < targetVersion;
}

/**
 * Migrates BlockStorage from one version to another.
 *
 * @param storage - Current BlockStorage
 * @param fromVersion - Source version
 * @param toVersion - Target version
 * @param handlers - Optional custom handlers
 * @returns Migrated BlockStorage
 */
export function migrateBlockStorage<TState>(
  storage: BlockStorage<TState>,
  fromVersion: number,
  toVersion: number,
  handlers: BlockStorageHandlers<TState> = defaultBlockStorageHandlers as BlockStorageHandlers<TState>,
): BlockStorage<TState> {
  const migrate = handlers.migrateStorage ?? defaultBlockStorageHandlers.migrateStorage;
  return migrate(storage, fromVersion, toVersion) as BlockStorage<TState>;
}

/**
 * V1/V2 legacy format - state stored as { args, uiState }
 */
export interface LegacyV1V2State {
  args?: unknown;
  uiState?: unknown;
}

/**
 * Checks if the raw data is in legacy V1/V2 format.
 * V1/V2 blocks stored { args, uiState } directly, not wrapped in BlockStorage.
 *
 * @param rawData - Raw data from blockStorage field
 * @returns true if data is in legacy format
 */
export function isLegacyV1V2Format(rawData: unknown): rawData is LegacyV1V2State {
  if (rawData === null || typeof rawData !== 'object') return false;
  // If it has the discriminator, it's BlockStorage format
  if (isBlockStorage(rawData)) return false;

  const obj = rawData as Record<string, unknown>;
  // Legacy format has 'args' and/or 'uiState' at top level, no discriminator
  return ('args' in obj || 'uiState' in obj);
}

/**
 * Converts legacy V1/V2 format to BlockStorage.
 * For backward compatibility with existing blocks.
 *
 * @param legacyData - Data in { args, uiState } format
 * @returns BlockStorage with legacy data as state
 */
export function convertLegacyToBlockStorage(legacyData: LegacyV1V2State): BlockStorage<LegacyV1V2State> {
  return createBlockStorage(legacyData, 1);
}

/**
 * Smart parser that handles all storage formats:
 * - New BlockStorage format
 * - Legacy V1/V2 format ({ args, uiState })
 * - Raw state (any other format)
 *
 * @param rawData - Raw data from blockStorage field
 * @returns Normalized BlockStorage
 */
export function parseBlockStorageSmart<TState = unknown>(rawData: unknown): BlockStorage<TState> {
  if (rawData === undefined || rawData === null) {
    return createBlockStorage<TState>({} as TState);
  }

  // If it's a string, parse it first
  let parsed = rawData;
  if (typeof rawData === 'string') {
    try {
      parsed = JSON.parse(rawData);
    } catch {
      // If parsing fails, treat the string as the state itself
      return createBlockStorage(rawData as unknown as TState);
    }
  }

  // Check for legacy V1/V2 format
  if (isLegacyV1V2Format(parsed)) {
    return convertLegacyToBlockStorage(parsed) as unknown as BlockStorage<TState>;
  }

  // Use standard normalization
  return normalizeBlockStorage<TState>(parsed);
}
