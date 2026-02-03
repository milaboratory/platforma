import type { ResultOrError, BlockConfig, PlRef, StorageDebugView } from '@platforma-sdk/model';
import type { StringifiedJson } from '@milaboratories/pl-model-common';
import { extractCodeWithInfo, ensureError, BlockStorageFacadeV2Callbacks, BlockStorageFacadeV2Handles } from '@platforma-sdk/model';
import { LRUCache } from 'lru-cache';
import type { QuickJSWASMModule } from 'quickjs-emscripten';
import { executeSingleLambda } from '../js_render';
import type { ResourceId } from '@milaboratories/pl-client';

type EnrichmentTargetsRequest = {
  blockConfig: () => BlockConfig;
  args: () => unknown;
};

type EnrichmentTargetsValue = {
  value: PlRef[] | undefined;
};

/**
 * Result of VM-based storage migration.
 * Returned by migrateStorageInVM().
 *
 * - Error result: { error: string } - serious failure (no context, etc.)
 * - Success result: { newStorageJson: string, info: string, warn?: string } - migration succeeded or reset to initial
 */
export type MigrationResult =
  | { error: string }
  | { error?: undefined; newStorageJson: string; info: string; warn?: string };

/**
 * Result of args derivation from storage.
 * Returned by __pl_args_derive and __pl_prerunArgs_derive VM callbacks.
 */
type ArgsDeriveResult =
  | { error: string }
  | { error?: undefined; value: unknown };

export class ProjectHelper {
  private readonly enrichmentTargetsCache = new LRUCache<string, EnrichmentTargetsValue, EnrichmentTargetsRequest>({
    max: 256,
    memoMethod: (_key, _value, { context }) => {
      return { value: this.calculateEnrichmentTargets(context) };
    },
  });

  constructor(private readonly quickJs: QuickJSWASMModule) {}

  // =============================================================================
  // Args Derivation from Storage (V3+)
  // =============================================================================

  /**
   * Derives args directly from storage JSON using VM callback.
   * The VM extracts data from storage and calls the block's args() function.
   *
   * This allows the middle layer to work only with storage JSON,
   * without needing to know the underlying data structure.
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param storageJson Storage as JSON string
   * @returns The derived args object, or error if derivation fails
   */
  public deriveArgsFromStorage(blockConfig: BlockConfig, storageJson: string): ResultOrError<unknown> {
    if (blockConfig.modelAPIVersion !== 2) {
      return { error: new Error('deriveArgsFromStorage is only supported for model API version 2') };
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        BlockStorageFacadeV2Handles[BlockStorageFacadeV2Callbacks.ArgsDerive],
        extractCodeWithInfo(blockConfig),
        storageJson,
      ) as ArgsDeriveResult;

      if (result.error !== undefined) {
        return { error: new Error(result.error) };
      }
      return { value: result.value };
    } catch (e) {
      return { error: new Error('Args derivation from storage failed', { cause: ensureError(e) }) };
    }
  }

  /**
   * Derives prerunArgs directly from storage JSON using VM callback.
   * Falls back to args() if prerunArgs is not defined in the block model.
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param storageJson Storage as JSON string
   * @returns The derived prerunArgs, or undefined if derivation fails
   */
  public derivePrerunArgsFromStorage(blockConfig: BlockConfig, storageJson: string): unknown {
    if (blockConfig.modelAPIVersion !== 2) {
      throw new Error('derivePrerunArgsFromStorage is only supported for model API version 2');
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        BlockStorageFacadeV2Handles[BlockStorageFacadeV2Callbacks.PrerunArgsDerive],
        extractCodeWithInfo(blockConfig),
        storageJson,
      ) as ArgsDeriveResult;

      if (result.error !== undefined) {
        // Return undefined if derivation fails (skip block in staging)
        return undefined;
      }
      return result.value;
    } catch {
      // Return undefined if derivation fails (skip block in staging)
      return undefined;
    }
  }

  private calculateEnrichmentTargets(req: EnrichmentTargetsRequest): PlRef[] | undefined {
    const blockConfig = req.blockConfig();
    if (blockConfig.enrichmentTargets === undefined) return undefined;
    const args = req.args();
    const result = executeSingleLambda(this.quickJs, blockConfig.enrichmentTargets, extractCodeWithInfo(blockConfig), args) as PlRef[];
    return result;
  }

  public getEnrichmentTargets(blockConfig: () => BlockConfig, args: () => unknown, key?: { argsRid: ResourceId; blockPackRid: ResourceId }): PlRef[] | undefined {
    const req = { blockConfig, args };
    if (key === undefined)
      return this.calculateEnrichmentTargets(req);
    const cacheKey = `${key.argsRid}:${key.blockPackRid}`;
    return this.enrichmentTargetsCache.memo(cacheKey, { context: req }).value;
  }

  // =============================================================================
  // VM-based Storage Operations
  // =============================================================================

  /**
   * Creates initial BlockStorage for a new block using VM-based transformation.
   * This calls the '__pl_storage_initial' callback registered by DataModel which:
   * - Gets initial data from DataModel.getDefaultData()
   * - Creates BlockStorage with correct version
   *
   * @param blockConfig The block configuration (provides the model code)
   * @returns Initial storage as JSON string
   * @throws Error if storage creation fails
   */
  public getInitialStorageInVM(blockConfig: BlockConfig): string {
    try {
      const result = executeSingleLambda(
        this.quickJs,
        BlockStorageFacadeV2Handles[BlockStorageFacadeV2Callbacks.StorageInitial],
        extractCodeWithInfo(blockConfig),
      ) as string;
      return result;
    } catch (e) {
      console.error('[ProjectHelper.getInitialStorageInVM] Initial storage creation failed:', e);
      throw new Error(`Block initial storage creation failed: ${e}`);
    }
  }

  /**
   * Applies a state update using VM-based transformation.
   * This calls the model's `__pl_storage_applyUpdate` callback which:
   * - Normalizes current storage
   * - Updates state while preserving other fields (version, plugins)
   * - Returns the updated storage as JSON string
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param currentStorageJson Current storage as JSON string (must be defined)
   * @param newState New state from developer
   * @returns Updated storage as JSON string
   * @throws Error if storage update fails
   */
  public applyStorageUpdateInVM(blockConfig: BlockConfig, currentStorageJson: string, payload: { operation: string; value: unknown }): string {
    try {
      const result = executeSingleLambda(
        this.quickJs,
        BlockStorageFacadeV2Handles[BlockStorageFacadeV2Callbacks.StorageApplyUpdate],
        extractCodeWithInfo(blockConfig),
        currentStorageJson,
        payload,
      ) as string;
      return result;
    } catch (e) {
      console.error('[ProjectHelper.applyStorageUpdateInVM] Storage update failed:', e);
      throw new Error(`Block storage update failed: ${e}`);
    }
  }

  /**
   * Gets storage debug view from raw storage data by calling the VM's __pl_storage_debugView callback.
   * Returns structured debug info about the storage (e.g., dataVersion).
   *
   * @param blockConfig Block configuration
   * @param rawStorageJson Raw storage as JSON string (or undefined)
   * @returns Storage debug view as JSON string (e.g., '{"dataVersion": "v1"}')
   */
  public getStorageDebugViewInVM(blockConfig: BlockConfig, rawStorageJson: string | undefined): StringifiedJson<StorageDebugView> | undefined {
    try {
      const result = executeSingleLambda(
        this.quickJs,
        BlockStorageFacadeV2Handles[BlockStorageFacadeV2Callbacks.StorageDebugView],
        extractCodeWithInfo(blockConfig),
        rawStorageJson,
      ) as StringifiedJson<StorageDebugView>;
      return result;
    } catch (e) {
      console.error('[ProjectHelper.getStorageDebugViewInVM] Get storage debug view failed:', e);
      return undefined;
    }
  }

  // =============================================================================
  // Block State Migrations
  // =============================================================================

  /**
   * Runs block state migrations via VM-based transformation.
   * This calls the model's `__pl_storage_migrate` callback which:
   * - Normalizes current storage to get state and version
   * - Applies DataModel upgrade to reach target version key
   * - Runs all necessary migrations sequentially
   * - Returns new storage with updated state and version
   *
   * The middle layer doesn't need to know about dataVersion or storage internals.
   * All migration logic is encapsulated in the model.
   *
   * @param blockConfig The NEW block configuration (provides the model code with migrations)
   * @param currentStorageJson Current storage as JSON string (or undefined)
   * @returns MigrationResult with new storage or skip/error info
   */
  public migrateStorageInVM(blockConfig: BlockConfig, currentStorageJson: string | undefined): MigrationResult {
    try {
      const result = executeSingleLambda(
        this.quickJs,
        BlockStorageFacadeV2Handles[BlockStorageFacadeV2Callbacks.StorageMigrate],
        extractCodeWithInfo(blockConfig),
        currentStorageJson,
      ) as MigrationResult;
      return result;
    } catch (e) {
      console.error('[ProjectHelper.migrateStorageInVM] Migration failed:', e);
      return { error: `VM execution failed: ${e}` };
    }
  }
}
