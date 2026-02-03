/**
 * Block Storage Facade - Contract between bundled blocks and middle layer.
 *
 * ============================================================================
 * VERSIONING
 * ============================================================================
 *
 * Blocks declare their model API version via the `requiresModelAPIVersion` feature flag
 * (see BlockCodeKnownFeatureFlags). This determines how the middle layer manages block state:
 *
 * - Version 1: Legacy BlockModel - state is {args, uiState}, managed directly by middle layer
 * - Version 2: BlockModelV3 - uses blockStorage with VM-based callbacks (this facade)
 *
 * This facade (BlockStorageFacadeV2) is used by blocks with `requiresModelAPIVersion: 2`.
 * The version number matches the model API version for clarity.
 *
 * ============================================================================
 * BACKWARD COMPATIBILITY WARNING
 * ============================================================================
 *
 * This file documents the FACADE between the SDK (bundled into blocks) and the
 * middle layer. Once a block is published, its SDK version is frozen. The middle
 * layer must support ALL previously released callback signatures indefinitely.
 *
 * RULES:
 * 1. NEVER change the signature of existing callbacks
 * 2. NEVER remove existing callbacks
 * 3. New callbacks CAN be added (old blocks won't register them, middle layer
 *    should handle missing callbacks gracefully)
 * 4. Callback return types can be EXTENDED (add optional fields) but not changed
 * 5. Callback parameter types should remain compatible (middle layer may need
 *    to handle both old and new formats)
 *
 * The facade consists of callbacks registered via `tryRegisterCallback()` with
 * the `__pl_` prefix. These are registered by the SDK when a block loads and
 * called by the middle layer to perform operations.
 *
 * ============================================================================
 * WHAT CAN BE CHANGED FREELY
 * ============================================================================
 *
 * - Middle layer code (lib/node/pl-middle-layer)
 * - SDK internal implementation (as long as callback contracts are preserved)
 * - SDK exports used ONLY by middle layer (not by blocks themselves)
 * - New SDK features that don't affect existing callbacks
 *
 * @module block_storage_facade
 */

import type { MutateStoragePayload } from "./block_storage";
import type { ConfigRenderLambda } from "./bconfig";
import { createRenderLambda } from "./internal";

// =============================================================================
// Facade Version
// =============================================================================

/**
 * The current facade version. This value is used for `requiresModelAPIVersion`
 * feature flag in BlockModelV3.
 */
export const BLOCK_STORAGE_FACADE_VERSION = 2;

// =============================================================================
// Facade Callback Names
// =============================================================================

/**
 * All facade callback names as constants.
 * These are the source of truth - the interface is derived from these.
 *
 * IMPORTANT: When adding a new callback:
 * 1. Add the constant here
 * 2. Add the callback signature to FacadeCallbackTypes below
 * 3. The BlockStorageFacade type will automatically include it
 */
export const BlockStorageFacadeV2Callbacks = {
  // Storage operations (registered in block_storage_vm.ts)
  StorageApplyUpdate: "__pl_storage_applyUpdate",
  StorageDebugView: "__pl_storage_debugView",
  StorageMigrate: "__pl_storage_migrate",
  ArgsDerive: "__pl_args_derive",
  PrerunArgsDerive: "__pl_prerunArgs_derive",

  // Data model operations (registered in block_migrations.ts)
  DataInitial: "__pl_data_initial",
  DataUpgrade: "__pl_data_upgrade",
  StorageInitial: "__pl_storage_initial",
} as const;

/**
 * Creates a map of lambda handles from a callbacks constant object.
 * Keys are the callback string values (e.g., '__pl_storage_applyUpdate').
 */
function createFacadeHandles<T extends Record<string, string>>(
  callbacks: T,
): { [K in T[keyof T]]: ConfigRenderLambda } {
  return Object.fromEntries(
    Object.values(callbacks).map((handle) => [handle, createRenderLambda({ handle })]),
  ) as { [K in T[keyof T]]: ConfigRenderLambda };
}

/**
 * Lambda handles for V2 facade callbacks.
 * Used by the middle layer to invoke callbacks via executeSingleLambda().
 */
export const BlockStorageFacadeV2Handles = createFacadeHandles(BlockStorageFacadeV2Callbacks);

// =============================================================================
// Facade Interface (source of truth for callback signatures)
// =============================================================================

/**
 * The complete facade interface between bundled blocks (SDK) and middle layer.
 *
 * This interface defines ALL callbacks that a V1 block registers. The middle layer
 * calls these callbacks to perform storage operations.
 *
 * ALL types are inlined to simplify versioning - when a callback changes,
 * the entire signature is visible in one place.
 *
 * BACKWARD COMPATIBILITY:
 * - This interface can only be EXTENDED, never shrunk
 * - Existing callback signatures MUST NOT change
 * - Middle layer should use Partial<BlockStorageFacadeV2> when dealing with
 *   blocks of unknown version (older blocks may not have all callbacks)
 *
 * Each callback is documented with:
 * - Purpose and when it's called
 * - Parameter descriptions
 * - Return value description
 */
export interface BlockStorageFacadeV2 {
  /**
   * Apply state update to storage.
   * Called when UI updates block state (setState) or plugin data.
   * @param currentStorageJson - Current storage as JSON string
   * @param payload - Update payload with operation type and value
   * @returns Updated storage as JSON string
   */
  [BlockStorageFacadeV2Callbacks.StorageApplyUpdate]: (
    currentStorageJson: string,
    payload: MutateStoragePayload,
  ) => string;

  /**
   * Get debug view of storage.
   * Called by developer tools to inspect storage state.
   * @param rawStorage - Raw storage data (may be JSON string or object)
   * @returns JSON string containing StorageDebugView
   */
  [BlockStorageFacadeV2Callbacks.StorageDebugView]: (rawStorage: unknown) => string;

  /**
   * Run storage migration.
   * Called when block loads to migrate data to latest version.
   * @param currentStorageJson - Current storage as JSON string (or undefined for new blocks)
   * @returns Migration result - either error or success with new storage
   */
  [BlockStorageFacadeV2Callbacks.StorageMigrate]: (
    currentStorageJson: string | undefined,
  ) =>
    | { error: string }
    | { error?: undefined; newStorageJson: string; info: string; warn?: string };

  /**
   * Derive args from storage.
   * Called to get block configuration args from storage.
   * @param storageJson - Storage as JSON string
   * @returns Args derivation result - either error or derived value
   */
  [BlockStorageFacadeV2Callbacks.ArgsDerive]: (
    storageJson: string,
  ) => { error: string } | { error?: undefined; value: unknown };

  /**
   * Derive prerunArgs from storage.
   * Called to get prerun args; falls back to args callback if not registered.
   * @param storageJson - Storage as JSON string
   * @returns Args derivation result - either error or derived value
   */
  [BlockStorageFacadeV2Callbacks.PrerunArgsDerive]: (
    storageJson: string,
  ) => { error: string } | { error?: undefined; value: unknown };

  /**
   * Get initial data for new blocks.
   * Called when creating a new block instance.
   * @returns Initial data value
   */
  [BlockStorageFacadeV2Callbacks.DataInitial]: () => unknown;

  /**
   * Upgrade data from old version.
   * Called during migration to transform data between versions.
   * @param versioned - Object with version and data to upgrade
   * @returns Migration result with upgraded data and new version
   */
  [BlockStorageFacadeV2Callbacks.DataUpgrade]: (versioned: { version: string; data: unknown }) => {
    version: string;
    data: unknown;
    warning?: string;
  };

  /**
   * Get initial storage JSON for new blocks.
   * Called when creating a new block to get complete initial storage.
   * @returns Initial storage as JSON string
   */
  [BlockStorageFacadeV2Callbacks.StorageInitial]: () => string;
}
