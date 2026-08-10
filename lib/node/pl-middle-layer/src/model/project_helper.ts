import type { ResultOrError, BlockConfig, BlockStorage, PlRef } from "@platforma-sdk/model";
import type { StringifiedJson } from "@milaboratories/pl-model-common";
import {
  extractCodeWithInfo,
  ensureError,
  BlockStorageFacadeCallbacks,
  BLOCK_STORAGE_FACADE_VERSION,
} from "@platforma-sdk/model";
import { LRUCache } from "lru-cache";
import type { QuickJSWASMModule } from "quickjs-emscripten";
import { executeSingleLambda } from "../js_render";
import type { SignedResourceId } from "@milaboratories/pl-client";
import { ConsoleLoggerAdapter, type MiLogger } from "@milaboratories/ts-helpers";
import type { StorageDebugView } from "@milaboratories/pl-model-middle-layer";
import { getDebugFlags } from "../debug";

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
 * - Success result: { newStorageJson: StringifiedJson<BlockStorage>, info: string } - migration succeeded
 */
export type MigrationResult =
  | { error: string }
  | { error?: undefined; newStorageJson: StringifiedJson<BlockStorage>; info: string };

/**
 * Result of args derivation from storage.
 * Returned by __pl_args_derive and __pl_prerunArgs_derive VM callbacks.
 */
type ArgsDeriveResult = { error: string } | { error?: undefined; value: unknown };

/**
 * Result of building initial storage from params.
 * Returned by the __pl_storage_initialFromParams VM callback.
 */
type ParamsStorageResult =
  | { error: string }
  | { error?: undefined; storageJson: StringifiedJson<BlockStorage> };

/**
 * Result of checking params against their kind.
 * Returned by the __pl_templateParams_validate VM callback.
 */
type TemplateParamsValidateResult = { error: string } | { error?: undefined };

export class ProjectHelper {
  private readonly enrichmentTargetsCache = new LRUCache<
    string,
    EnrichmentTargetsValue,
    EnrichmentTargetsRequest
  >({
    max: 256,
    memoMethod: (_key, _value, { context }) => {
      return { value: this.calculateEnrichmentTargets(context) };
    },
  });

  constructor(
    private readonly quickJs: QuickJSWASMModule,
    public readonly logger: MiLogger = new ConsoleLoggerAdapter(),
  ) {}

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
  public deriveArgsFromStorage(
    blockConfig: BlockConfig,
    storageJson: string,
  ): ResultOrError<unknown> {
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      return {
        error: new Error("deriveArgsFromStorage is only supported for model API version 2"),
      };
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.ArgsDerive],
        extractCodeWithInfo(blockConfig),
        storageJson,
      ) as ArgsDeriveResult;

      if (result.error !== undefined) {
        return { error: new Error(result.error) };
      }
      return { value: result.value };
    } catch (e) {
      return { error: new Error("Args derivation from storage failed", { cause: ensureError(e) }) };
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
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      throw new Error("derivePrerunArgsFromStorage is only supported for model API version 2");
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.PrerunArgsDerive],
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

  /**
   * Derives this block's template-export params from storage JSON using the VM
   * callback (`__pl_templateParams_derive`, facade callback #7).
   *
   * The template-export counterpart of {@link deriveArgsFromStorage}: instead of
   * the args a workflow runs on, it returns the params that would recreate the
   * block — the inverse of the data model's `init`. References come back
   * already rewritten into template form by the SDK side, so the middle layer
   * never has to know a kind's params shape.
   *
   * A `{ value: undefined }` result is NOT a failure: it means the block declares no
   * `templateParams`, which only a block built against an older SDK can do, and the
   * exported entry gets no `params` key.
   *
   * Unlike {@link derivePrerunArgsFromStorage}, a failure here is surfaced rather
   * than swallowed — a prerun that cannot derive args just skips a block in
   * staging, whereas an export that silently drops a block produces a template
   * that does not describe the project.
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param storageJson Storage as JSON string
   * @returns The derived params in template form, `undefined` if the block
   *   declares no lambda, or an error if derivation failed
   */
  public deriveTemplateParamsFromStorage(
    blockConfig: BlockConfig,
    storageJson: string,
  ): ResultOrError<unknown> {
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      return {
        error: new Error(
          "deriveTemplateParamsFromStorage is only supported for model API version 2",
        ),
      };
    }

    const callback =
      blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.TemplateParamsDerive];

    // A model built before this callback existed simply has no entry for it. That is
    // NOT the same as a block declaring no `templateParams`: the block may well have
    // params, we just have no way to ask for them. Reporting it as `undefined` params
    // would export the block stripped of its configuration and quietly rebuild a
    // differently-configured project, so it has to be an error.
    // The message names the one action available to whoever pressed Export. It
    // deliberately says nothing about SDKs or callbacks: the person reading it did
    // not build this block and cannot change how it was built.
    if (callback === undefined) {
      return {
        error: new Error(
          "This version of the block cannot be written to a template. Update the block " +
            "to a newer version and export again.",
        ),
      };
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        callback,
        extractCodeWithInfo(blockConfig),
        storageJson,
      ) as ArgsDeriveResult;

      if (result.error !== undefined) {
        return { error: new Error(result.error) };
      }
      return { value: result.value };
    } catch (e) {
      const cause = ensureError(e);
      // The reason goes in the message, not only in `cause`: this error is rendered
      // into a per-block export problem and shown to whoever triggered the export,
      // and every layer between here and there carries only `message`.
      return {
        error: new Error(`Template params derivation from storage failed: ${cause.message}`, {
          cause,
        }),
      };
    }
  }

  private calculateEnrichmentTargets(req: EnrichmentTargetsRequest): PlRef[] | undefined {
    const blockConfig = req.blockConfig();
    if (blockConfig.enrichmentTargets === undefined) return undefined;
    const args = req.args();
    const result = executeSingleLambda(
      this.quickJs,
      blockConfig.enrichmentTargets,
      extractCodeWithInfo(blockConfig),
      args,
    ) as PlRef[];
    return result;
  }

  public getEnrichmentTargets(
    blockConfig: () => BlockConfig,
    args: () => unknown,
    key?: { argsRid: SignedResourceId; blockPackRid: SignedResourceId },
  ): PlRef[] | undefined {
    const req = { blockConfig, args };
    if (key === undefined) return this.calculateEnrichmentTargets(req);
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
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      throw new Error("getInitialStorageInVM is only supported for model API version 2");
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.StorageInitial],
        extractCodeWithInfo(blockConfig),
      ) as string;
      return result;
    } catch (e) {
      this.logger.error(
        new Error("[ProjectHelper.getInitialStorageInVM] Initial storage creation failed", {
          cause: e,
        }),
      );
      throw new Error(`Block initial storage creation failed: ${e}`);
    }
  }

  /**
   * Checks a template entry's params against the block's kind, creating nothing.
   *
   * The pre-flight half of {@link getInitialStorageFromParamsInVM}: run once per entry
   * before a template is applied, so params a kind rejects are reported against the
   * entry that carries them while there is still no project. Skipping it is safe —
   * initialization runs the same check — but then the report arrives after earlier
   * entries have already been created.
   *
   * Every kind declares a parser, so a pass here means the params were checked against
   * the contract — not merely that they were JSON.
   *
   * A block whose model predates the callback passes unchecked rather than failing.
   * Unlike initialization, this method creates nothing, so there is nothing to get wrong
   * by proceeding, and such a block is refused outright at the point it is applied.
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param params The entry's params. Reference ids may be placeholders: what is being
   *   checked is the shape of the params, not what they point at
   * @returns Nothing, or why the params were rejected
   */
  public validateTemplateParamsInVM(
    blockConfig: BlockConfig,
    params: unknown,
  ): ResultOrError<undefined> {
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      return {
        error: new Error("validateTemplateParamsInVM is only supported for model API version 2"),
      };
    }

    const callback =
      blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.TemplateParamsValidate];
    if (callback === undefined) return { value: undefined };

    try {
      const result = executeSingleLambda(
        this.quickJs,
        callback,
        extractCodeWithInfo(blockConfig),
        JSON.stringify(params ?? {}),
      ) as TemplateParamsValidateResult;

      if (result.error !== undefined) return { error: new Error(result.error) };
      return { value: undefined };
    } catch (e) {
      const cause = ensureError(e);
      return { error: new Error(`Params check failed to run: ${cause.message}`, { cause }) };
    }
  }

  /**
   * Creates initial BlockStorage for a block being created from template params.
   *
   * The inverse of {@link deriveTemplateParamsFromStorage}, and the reason a block
   * can be created by anything other than the UI: it hands the params to the
   * block's own init factory inside the model VM, so the resulting storage is
   * whatever that block considers a correctly-initialized state.
   *
   * The caller must resolve references in `params` first — a reference reaching the
   * factory has to name a block that already exists in the target project.
   *
   * @param blockConfig The block configuration (provides the model code)
   * @param params The entry's params, with references already resolved
   * @returns The initial storage as JSON string, or why the params yield none
   */
  public getInitialStorageFromParamsInVM(
    blockConfig: BlockConfig,
    params: unknown,
  ): ResultOrError<string> {
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      return {
        error: new Error(
          "getInitialStorageFromParamsInVM is only supported for model API version 2",
        ),
      };
    }

    const callback =
      blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.StorageInitialFromParams];

    // A model built before this callback existed has no entry for it. Falling back
    // to the params-less initializer is not an option: it would produce a
    // default-configured block that looks like a successful apply, so the block the
    // user gets would silently differ from the one the template describes.
    //
    // The message offers the two actions available to whoever applied the file. The
    // second one is the reason this branch is reachable at all: kind resolution only
    // ever returns a block that declares a kind, and such a block is new enough to
    // support this — but an entry may pin an exact block version instead, bypassing
    // resolution, and that pin can name anything ever published.
    if (callback === undefined) {
      return {
        error: new Error(
          "This version of the block cannot be created from a template. Use a newer " +
            "version of the block, or remove the pinned block version from the template " +
            "entry so a supported one is chosen automatically.",
        ),
      };
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        callback,
        extractCodeWithInfo(blockConfig),
        // Params cross the VM boundary as text, like storage does. `undefined` would
        // stringify to nothing at all, and an entry with no params must go through
        // the params-less initializer rather than reaching this method.
        JSON.stringify(params ?? {}),
      ) as ParamsStorageResult;

      if (result.error !== undefined) return { error: new Error(result.error) };
      return { value: result.storageJson };
    } catch (e) {
      const cause = ensureError(e);
      // The reason goes in the message, not only in `cause`: this error becomes a
      // per-entry apply problem shown to whoever triggered the import, and every
      // layer in between carries only `message`.
      return {
        error: new Error(`Initial storage creation from params failed: ${cause.message}`, {
          cause,
        }),
      };
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
  public applyStorageUpdateInVM(
    blockConfig: BlockConfig,
    currentStorageJson: string,
    payload: { operation: string; value: unknown },
  ): string {
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      throw new Error("applyStorageUpdateInVM is only supported for model API version 2");
    }

    if (getDebugFlags().logJsExecStat) {
      this.logger.info(
        `[ProjectHelper.applyStorageUpdateInVM] currentStorageJson=${currentStorageJson.length}B, payload=${JSON.stringify(payload).length}B, operation=${payload.operation}`,
      );
    }
    try {
      const result = executeSingleLambda(
        this.quickJs,
        blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.StorageApplyUpdate],
        extractCodeWithInfo(blockConfig),
        currentStorageJson,
        payload,
      ) as string;
      return result;
    } catch (e) {
      const payloadJson = JSON.stringify(payload);
      this.logger.error(
        new Error(
          `[ProjectHelper.applyStorageUpdateInVM] Storage update failed (currentStorageJson=${currentStorageJson.length}B, payload=${payloadJson.length}B, operation=${payload.operation})`,
          { cause: e },
        ),
      );
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
  public getStorageDebugViewInVM(
    blockConfig: BlockConfig,
    rawStorageJson: string | undefined,
  ): StringifiedJson<StorageDebugView> | undefined {
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      throw new Error("getStorageDebugViewInVM is only supported for model API version 2");
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.StorageDebugView],
        extractCodeWithInfo(blockConfig),
        rawStorageJson,
      ) as StringifiedJson<StorageDebugView>;
      return result;
    } catch (e) {
      this.logger.error(
        new Error("[ProjectHelper.getStorageDebugViewInVM] Get storage debug view failed", {
          cause: e,
        }),
      );
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
  public migrateStorageInVM(
    blockConfig: BlockConfig,
    currentStorageJson: string | undefined,
  ): MigrationResult {
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      return { error: "migrateStorageInVM is only supported for model API version 2" };
    }

    try {
      const result = executeSingleLambda(
        this.quickJs,
        blockConfig.blockLifecycleCallbacks[BlockStorageFacadeCallbacks.StorageMigrate],
        extractCodeWithInfo(blockConfig),
        currentStorageJson,
      ) as MigrationResult;
      return result;
    } catch (e) {
      this.logger.error(
        new Error("[ProjectHelper.migrateStorageInVM] Migration failed", { cause: e }),
      );
      return { error: `VM execution failed: ${e}` };
    }
  }
}
