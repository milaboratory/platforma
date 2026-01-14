import type { ResultOrError, BlockConfig, PlRef, ConfigRenderLambda } from '@platforma-sdk/model';
import { extractCodeWithInfo, ensureError } from '@platforma-sdk/model';
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
 * Result of VM-based storage normalization
 */
interface NormalizeStorageResult {
  storage: unknown;
  data: unknown;
}

/**
 * Result of VM-based storage migration.
 * Returned by migrateStorageInVM().
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

// Internal lambda handles for storage operations (registered by SDK's block_storage_vm.ts)
const STORAGE_NORMALIZE_HANDLE: ConfigRenderLambda = { __renderLambda: true, handle: '__storage_normalize' };
const STORAGE_APPLY_UPDATE_HANDLE: ConfigRenderLambda = { __renderLambda: true, handle: '__storage_applyUpdate' };
const STORAGE_GET_INFO_HANDLE: ConfigRenderLambda = { __renderLambda: true, handle: '__storage_getInfo' };
const STORAGE_MIGRATE_HANDLE: ConfigRenderLambda = { __renderLambda: true, handle: '__storage_migrate' };

export class ProjectHelper {
  private readonly enrichmentTargetsCache = new LRUCache<string, EnrichmentTargetsValue, EnrichmentTargetsRequest>({
    max: 256,
    memoMethod: (_key, _value, { context }) => {
      return { value: this.calculateEnrichmentTargets(context) };
    },
  });

  constructor(private readonly quickJs: QuickJSWASMModule) {}

  /**
   * Executes the config.args() callback to derive args from state.
   * The callback is defined in block model as:
   *   .args<BlockArgs>((ctx) => ({ numbers: ctx.state.numbers }))
   *
   * @param blockConfig The block configuration containing the args lambda
   * @param state The block state to derive args from (v3 format: direct state object)
   * @returns The derived args object, or undefined if no args lambda or derivation fails
   */
  public deriveArgsFromState(blockConfig: BlockConfig, state: unknown): ResultOrError<unknown> {
    if (blockConfig.configVersion !== 4) {
      return { error: new Error('deriveArgsFromState is only supported for config version 4') };
    }

    // args is always a ConfigRenderLambda in V4 config (BlockModelV3)
    const argsLambda = blockConfig.args;

    try {
      const value = executeSingleLambda(this.quickJs, argsLambda, extractCodeWithInfo(blockConfig), state);
      return { value };
    } catch (e) {
      return { error: new Error('Args derivation failed', { cause: ensureError(e) }) };
    }
  }

  /**
   * Executes the config.preRunArgs() callback to derive pre-run args from state.
   * Falls back to deriveArgsFromState() if preRunArgs is not defined.
   *
   * If the model does not define a preRunArgs method, defaults to using args.
   * If preRunArgs is defined, uses its return value for the staging / pre-run phase.
   *
   * @param blockConfig The block configuration containing the preRunArgs lambda
   * @param state The block state to derive pre-run args from
   * @returns The derived pre-run args, or undefined if derivation fails
   */
  public derivePreRunArgsFromState(blockConfig: BlockConfig, state: unknown): unknown {
    if (blockConfig.configVersion !== 4) {
      return this.deriveArgsFromState(blockConfig, state);
    }
    // Check for preRunArgs lambda in v4 config (BlockModelV3)
    const preRunArgsLambda = blockConfig.preRunArgs;
    if (preRunArgsLambda === undefined) {
      // Fall back to args() if preRunArgs not defined
      return this.deriveArgsFromState(blockConfig, state);
    }
    try {
      return executeSingleLambda(this.quickJs, preRunArgsLambda, extractCodeWithInfo(blockConfig), state);
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
   * Normalizes raw blockStorage data using VM-based transformation.
   * This calls the model's `__storage_normalize` callback which:
   * - Handles BlockStorage format (with discriminator)
   * - Handles legacy V1/V2 format ({ args, uiState })
   * - Handles raw V3 state
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param rawStorage Raw storage data from resource tree (may be JSON string or object)
   * @returns Object with { storage, state } or undefined if transformation fails
   */
  public normalizeStorageInVM(blockConfig: BlockConfig, rawStorage: unknown): NormalizeStorageResult | undefined {
    try {
      const result = executeSingleLambda(
        this.quickJs,
        STORAGE_NORMALIZE_HANDLE,
        extractCodeWithInfo(blockConfig),
        rawStorage,
      ) as NormalizeStorageResult;
      return result;
    } catch (e) {
      console.warn('[ProjectHelper.normalizeStorageInVM] Storage normalization failed:', e);
      return undefined;
    }
  }

  /**
   * Applies a state update using VM-based transformation.
   * This calls the model's `__storage_applyUpdate` callback which:
   * - Normalizes current storage
   * - Updates state while preserving other fields (version, plugins)
   * - Returns the updated storage as JSON string
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param currentStorageJson Current storage as JSON string (or undefined for new blocks)
   * @param newState New state from developer
   * @returns Updated storage as JSON string
   * @throws Error if storage update fails
   */
  public applyStorageUpdateInVM(blockConfig: BlockConfig, currentStorageJson: string | undefined, newState: unknown): string {
    try {
      const result = executeSingleLambda(
        this.quickJs,
        STORAGE_APPLY_UPDATE_HANDLE,
        extractCodeWithInfo(blockConfig),
        currentStorageJson,
        newState,
      ) as string;
      return result;
    } catch (e) {
      console.error('[ProjectHelper.applyStorageUpdateInVM] Storage update failed:', e);
      throw new Error(`Block storage update failed: ${e}`);
    }
  }

  /**
   * Gets storage info from raw storage data by calling the VM's __storage_getInfo callback.
   * Returns structured info about the storage (e.g., dataVersion).
   *
   * @param blockConfig Block configuration
   * @param rawStorageJson Raw storage as JSON string (or undefined)
   * @returns Storage info as JSON string (e.g., '{"dataVersion": 1}')
   */
  public getStorageInfoInVM(blockConfig: BlockConfig, rawStorageJson: string | undefined): string | undefined {
    try {
      const result = executeSingleLambda(
        this.quickJs,
        STORAGE_GET_INFO_HANDLE,
        extractCodeWithInfo(blockConfig),
        rawStorageJson,
      ) as string;
      return result;
    } catch (e) {
      console.error('[ProjectHelper.getStorageInfoInVM] Get storage info failed:', e);
      return undefined;
    }
  }

  // =============================================================================
  // Block State Migrations
  // =============================================================================

  /**
   * Runs block state migrations via VM-based transformation.
   * This calls the model's `__storage_migrate` callback which:
   * - Normalizes current storage to get state and version
   * - Calculates target version from number of registered migrations
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
        STORAGE_MIGRATE_HANDLE,
        extractCodeWithInfo(blockConfig),
        currentStorageJson,
      ) as MigrationResult;
      return result;
    } catch (e) {
      console.error('[ProjectHelper.migrateStorageInVM] Migration failed:', e);
      return {
        migrated: false,
        error: `VM execution failed: ${e}`,
        info: `Migration failed: VM execution error`,
      };
    }
  }
}
