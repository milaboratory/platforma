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
 * This facade (BlockStorageFacade) is used by blocks with `requiresModelAPIVersion: 2`.
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
import { createRenderLambda, tryRegisterCallback } from "./internal";
import type { StringifiedJson } from "@milaboratories/pl-model-common";

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
export const BlockStorageFacadeCallbacks = {
  StorageApplyUpdate: "__pl_storage_applyUpdate",
  StorageDebugView: "__pl_storage_debugView",
  StorageMigrate: "__pl_storage_migrate",
  ArgsDerive: "__pl_args_derive",
  PrerunArgsDerive: "__pl_prerunArgs_derive",
  StorageInitial: "__pl_storage_initial",
  TemplateParamsDerive: "__pl_templateParams_derive",
  StorageInitialFromParams: "__pl_storage_initialFromParams",
  TemplateParamsValidate: "__pl_templateParams_validate",
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
 * Lambda handles for facade callbacks.
 * Used by the middle layer to invoke callbacks via executeSingleLambda().
 */
export const BlockStorageFacadeHandles = createFacadeHandles(BlockStorageFacadeCallbacks);

// =============================================================================
// Facade Interface (source of truth for callback signatures)
// =============================================================================

/**
 * The complete facade interface between bundled blocks (SDK) and middle layer.
 *
 * This interface defines ALL callbacks that a block registers. The middle layer
 * calls these callbacks to perform storage operations.
 *
 * ALL types are inlined to simplify versioning - when a callback changes,
 * the entire signature is visible in one place.
 *
 * BACKWARD COMPATIBILITY:
 * - This interface can only be EXTENDED, never shrunk
 * - Existing callback signatures MUST NOT change
 * - Middle layer should use Partial<BlockStorageFacade> when dealing with
 *   blocks of unknown version (older blocks may not have all callbacks)
 *
 * Each callback is documented with:
 * - Purpose and when it's called
 * - Parameter descriptions
 * - Return value description
 */
export interface BlockStorageFacade {
  /**
   * Apply state update to storage.
   * Called when UI updates block state (setState) or plugin data.
   * @param currentStorageJson - Current storage as JSON string
   * @param payload - Update payload with operation type and value
   * @returns Updated storage as JSON string
   */
  [BlockStorageFacadeCallbacks.StorageApplyUpdate]: (
    currentStorageJson: StringifiedJson,
    payload: MutateStoragePayload,
  ) => StringifiedJson;

  /**
   * Get debug view of storage.
   * Called by developer tools to inspect storage state.
   * @param storageJson - Storage as JSON string (or undefined for new blocks)
   * @returns JSON string containing StorageDebugView
   */
  [BlockStorageFacadeCallbacks.StorageDebugView]: (
    storageJson: StringifiedJson | undefined,
  ) => StringifiedJson;

  /**
   * Run storage migration.
   * Called when block loads to migrate data to latest version.
   * @param currentStorageJson - Current storage as JSON string (or undefined for new blocks)
   * @returns Migration result - either error or success with new storage
   */
  [BlockStorageFacadeCallbacks.StorageMigrate]: (currentStorageJson: StringifiedJson | undefined) =>
    | { error: string }
    | {
        error?: undefined;
        newStorageJson: StringifiedJson;
        info: string;
      };

  /**
   * Derive args from storage.
   * Called to get block configuration args from storage.
   * @param storageJson - Storage as JSON string
   * @returns Args derivation result - either error or derived value
   */
  [BlockStorageFacadeCallbacks.ArgsDerive]: (
    storageJson: StringifiedJson,
  ) => { error: string } | { error?: undefined; value: unknown };

  /**
   * Derive prerunArgs from storage.
   * Called to get prerun args; falls back to args callback if not registered.
   * @param storageJson - Storage as JSON string
   * @returns Args derivation result - either error or derived value
   */
  [BlockStorageFacadeCallbacks.PrerunArgsDerive]: (
    storageJson: StringifiedJson,
  ) => { error: string } | { error?: undefined; value: unknown };

  /**
   * Get initial storage JSON for new blocks.
   * Called when creating a new block to get complete initial storage.
   * @returns Initial storage as JSON string
   */
  [BlockStorageFacadeCallbacks.StorageInitial]: () => StringifiedJson;

  /**
   * Derive this block's template entry params from storage.
   * Called when exporting the project as a template.
   *
   * Registered by every V3 block, whether or not it declares `.templateParams()`:
   * a block without the method returns `{ value: undefined }`, which the exporter
   * writes as an entry with no `params` (the block re-initializes from its kind's
   * defaults). `undefined` and `{}` are therefore NOT interchangeable — empty
   * params are emitted as `params: {}` and used as-is by init.
   *
   * The returned params are already in template form: references appear as
   * `{ block, output }` rather than as `PlRef`s. The caller supplies everything
   * else in the entry — `id`, `kind` — so the lambda cannot set them.
   *
   * @param storageJson - Storage as JSON string
   * @returns Either an error, or the params to write (undefined for none)
   */
  [BlockStorageFacadeCallbacks.TemplateParamsDerive]: (
    storageJson: StringifiedJson,
  ) => { error: string } | { error?: undefined; value: unknown };

  /**
   * Get initial storage JSON for a block created from params.
   * Called when applying a template, once per entry that carries `params`.
   *
   * The mirror image of {@link BlockStorageFacadeCallbacks.TemplateParamsDerive}:
   * that one turns storage into params, this one turns params into storage. An
   * entry with no `params` uses the plain
   * {@link BlockStorageFacadeCallbacks.StorageInitial} instead, so a block built
   * before this callback existed still applies from such an entry.
   *
   * Separate from `StorageInitial` rather than an optional argument to it,
   * deliberately: a block bundled with an older SDK does not register this
   * callback at all, so the caller sees it missing and can say so. Widening
   * `StorageInitial` would instead have that block silently ignore the params and
   * produce a default-initialized block that looks successfully applied.
   *
   * The params arrive as ordinary live params — references are `PlRef`s, already
   * pointing at the ids the target project just assigned. Resolution happens in
   * the engine, before this call, so a block's init factory never handles a
   * template-local reference.
   *
   * Errors are returned, not thrown: a factory rejecting params it cannot use is
   * an expected outcome for a hand-written template file, and every entry's
   * problem is reported together.
   *
   * @param paramsJson - The entry's params as JSON string
   * @returns Either an error, or the initial storage as JSON string
   */
  [BlockStorageFacadeCallbacks.StorageInitialFromParams]: (
    paramsJson: StringifiedJson,
  ) => { error: string } | { error?: undefined; storageJson: StringifiedJson };

  /**
   * Check params against this block's kind, creating nothing.
   *
   * Called once per entry before a template is applied, so params a kind rejects are
   * reported against the entry that carries them while there is still no project — the
   * same reason references and ids are checked before construction starts. Applying
   * without this call is safe but worse: `StorageInitialFromParams` runs the same check
   * and refuses, by which point earlier entries have already been created.
   *
   * `checked: false` reports that the kind declares no runtime check, so nothing was
   * verified beyond the params being valid JSON. It is not a failure — most kinds start
   * out this way — but it is the only way a caller can tell an unchecked pass from a
   * checked one.
   *
   * Reference ids inside the params may be placeholders at this point: the check runs
   * before blocks exist, so what is verified is the shape of the params, not what they
   * point at.
   *
   * @param paramsJson The entry's params as JSON string
   * @returns Either why the params were rejected, or whether anything checked them
   */
  [BlockStorageFacadeCallbacks.TemplateParamsValidate]: (
    paramsJson: StringifiedJson,
  ) => { error: string } | { error?: undefined; checked: boolean };
}

/** Register all facade callbacks at once. Ensures all required callbacks are provided. */
export function registerFacadeCallbacks(callbacks: BlockStorageFacade): void {
  for (const key of Object.values(BlockStorageFacadeCallbacks)) {
    tryRegisterCallback(key, callbacks[key] as (...args: any[]) => any);
  }
}
