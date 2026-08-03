/**
 * BlockStorage Callback Implementations - wired to facade callbacks in BlockModelV3.done().
 *
 * Provides pure functions for storage operations (migration, initialization,
 * args derivation, updates, debug views). Each function takes its dependencies
 * explicitly as parameters.
 *
 * @module block_storage_callbacks
 * @internal
 */

import {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  type BlockStorage,
  type MutateStoragePayload,
  type PluginRegistry,
  type VersionedData,
  createBlockStorage,
  getStorageData,
  isBlockStorage,
  migrateBlockStorage,
  normalizeBlockStorage,
  updateStorageData,
} from "./block_storage";
import type { PluginHandle } from "./plugin_handle";

import {
  stringifyJson,
  toTemplateForm,
  type StringifiedJson,
} from "@milaboratories/pl-model-common";
import type { DataVersioned, TransferRecord } from "./block_migrations";
import type { StorageDebugView } from "@milaboratories/pl-model-middle-layer";

// =============================================================================
// Hook interfaces for dependency injection
// =============================================================================

/** Dependencies for storage migration */
export interface MigrationHooks {
  migrateBlockData: (versioned: DataVersioned<unknown>) => DataVersioned<unknown> & {
    transfers: TransferRecord;
  };
  getPluginRegistry: () => PluginRegistry;
  migratePluginData: (
    handle: PluginHandle,
    versioned: DataVersioned<unknown>,
  ) => DataVersioned<unknown> | undefined;
  createPluginData: (
    handle: PluginHandle,
    transfer?: DataVersioned<unknown>,
  ) => DataVersioned<unknown>;
}

/** Dependencies for initial storage creation */
export interface InitialStorageHooks {
  getDefaultBlockData: () => DataVersioned<unknown>;
  getPluginRegistry: () => PluginRegistry;
  createPluginData: (handle: PluginHandle) => DataVersioned<unknown>;
}

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
 * @param payload - Update payload with operation type and value
 * @returns Updated storage as StringifiedJson<BlockStorage>
 */
export function applyStorageUpdate(
  currentStorageJson: string,
  payload: MutateStoragePayload,
): StringifiedJson<BlockStorage> {
  const { storage: currentStorage } = normalizeStorage(currentStorageJson);

  // Update data while preserving other storage fields (version, plugins)
  const updatedStorage = updateStorageData(currentStorage, payload);

  return stringifyJson(updatedStorage);
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
// Facade Callback Implementations
// =============================================================================

/**
 * Gets storage debug view from raw storage data.
 * Returns structured debug info about the storage state.
 *
 * @param rawStorage - Raw data from blockStorage field (may be JSON string or object)
 * @returns JSON string with storage debug view
 */
export function getStorageDebugView(rawStorage: unknown): StringifiedJson<StorageDebugView> {
  const { storage } = normalizeStorage(rawStorage);
  const debugView: StorageDebugView = {
    dataVersion: storage.__dataVersion,
    data: storage.__data,
  };
  return stringifyJson(debugView);
}

// =============================================================================
// Migration Support
// =============================================================================

/**
 * Result of storage migration.
 * Returned by __pl_storage_migrate callback.
 *
 * - Error result: { error: string } - serious failure (no context, etc.)
 * - Success result: { newStorageJson: StringifiedJson<BlockStorage>, info: string } - migration succeeded
 */
export type MigrationResult =
  | { error: string }
  | { error?: undefined; newStorageJson: StringifiedJson<BlockStorage>; info: string };

/**
 * Runs storage migration using the provided hooks.
 * This is the main entry point for the middle layer to trigger migrations.
 *
 * @param currentStorageJson - Current storage as JSON string (or undefined)
 * @param hooks - Migration dependencies (block/plugin data migration and creation functions)
 * @returns MigrationResult
 */
export function migrateStorage(
  currentStorageJson: string | undefined,
  hooks: MigrationHooks,
): MigrationResult {
  // Normalize current storage
  const { storage: currentStorage } = normalizeStorage(currentStorageJson);

  const newPluginRegistry = hooks.getPluginRegistry();

  // Perform atomic migration of block + all plugins
  const migrationResult = migrateBlockStorage(currentStorage, {
    migrateBlockData: hooks.migrateBlockData,
    migratePluginData: hooks.migratePluginData,
    newPluginRegistry,
    createPluginData: hooks.createPluginData,
  });

  if (!migrationResult.success) {
    return {
      error: `Migration failed at '${migrationResult.failedAt}': ${migrationResult.error}`,
    };
  }

  // Build info message
  const oldVersion = currentStorage.__dataVersion;
  const newVersion = migrationResult.storage.__dataVersion;
  const info =
    oldVersion === newVersion
      ? `No migration needed (${oldVersion})`
      : `Migrated ${oldVersion} -> ${newVersion}`;

  return {
    newStorageJson: stringifyJson(migrationResult.storage),
    info,
  };
}

// =============================================================================
// Initial Storage Creation
// =============================================================================

/**
 * Creates complete initial storage (block data + all plugin data) atomically.
 *
 * @param hooks - Dependencies for creating initial block and plugin data
 * @returns Initial storage as branded JSON string
 * @throws If initialDataFn or createPluginData throws
 */
export function createInitialStorage(hooks: InitialStorageHooks): StringifiedJson<BlockStorage> {
  return assembleStorage(hooks.getDefaultBlockData(), hooks);
}

/**
 * Wraps freshly created block data and freshly created plugin data into storage.
 *
 * Shared by the two ways a block's first storage comes into being — from defaults
 * and from template params. Only the block's own data differs between them:
 * plugins have no params channel, so they are always created at their defaults.
 */
function assembleStorage(
  blockData: DataVersioned<unknown>,
  hooks: Omit<InitialStorageHooks, "getDefaultBlockData">,
): StringifiedJson<BlockStorage> {
  const pluginRegistry = hooks.getPluginRegistry();

  const plugins: Record<PluginHandle, VersionedData<unknown>> = {};
  for (const handle of Object.keys(pluginRegistry) as PluginHandle[]) {
    const initial = hooks.createPluginData(handle);
    plugins[handle] = { __dataVersion: initial.version, __data: initial.data };
  }

  const storage: BlockStorage = {
    [BLOCK_STORAGE_KEY]: BLOCK_STORAGE_SCHEMA_VERSION,
    __dataVersion: blockData.version,
    __data: blockData.data,
    __pluginRegistry: pluginRegistry,
    __plugins: plugins,
  };
  return stringifyJson(storage);
}

/** Dependencies for creating storage from a template entry's params. */
export interface ParamsStorageHooks extends Omit<InitialStorageHooks, "getDefaultBlockData"> {
  /** The block's init factory, called with the entry's params. */
  getBlockDataFromParams: (params: unknown) => DataVersioned<unknown>;
}

/**
 * Result of building initial storage from params.
 * Returned by the `__pl_storage_initialFromParams` callback.
 */
export type ParamsStorageResult =
  | { error: string }
  | { error?: undefined; storageJson: StringifiedJson<BlockStorage> };

/**
 * Creates complete initial storage for a block being created from template params.
 *
 * The inverse of {@link deriveTemplateParamsFromStorage}: that projects storage
 * into params, this builds storage from them. The params are handed to the block's
 * init factory, whose output is versioned and wrapped exactly as
 * {@link createInitialStorage} wraps the defaults — so a block created from a
 * template is indistinguishable from one created in the UI and then edited.
 *
 * Params arrive as JSON text because this runs across the model-VM boundary, where
 * only strings pass. Anything the factory rejects is returned as an error rather
 * than thrown: applying a hand-written template is expected to surface bad params,
 * and the applier reports every entry's problem in one pass.
 *
 * @param paramsJson - The entry's params as JSON string, with references resolved
 * @param hooks - The block's init factory plus plugin creation
 * @returns The storage to write, or why the params could not produce any
 */
export function createInitialStorageFromParams(
  paramsJson: string,
  hooks: ParamsStorageHooks,
): ParamsStorageResult {
  let params: unknown;
  try {
    params = JSON.parse(paramsJson);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `params are not valid JSON: ${errorMsg}` };
  }

  try {
    return { storageJson: assembleStorage(hooks.getBlockDataFromParams(params), hooks) };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `init() threw on the given params: ${errorMsg}` };
  }
}

// =============================================================================
// Args Derivation from Storage
// =============================================================================

/**
 * Result of args derivation from storage.
 * Returned by __pl_args_derive and __pl_prerunArgs_derive callbacks.
 */
export type ArgsDeriveResult = { error: string } | { error?: undefined; value: unknown };

/**
 * Derives args from storage using the provided args function.
 * This extracts data from storage and passes it to the block's args() function.
 *
 * @param storageJson - Storage as JSON string
 * @param deriveArgs - The block's args derivation function
 * @returns ArgsDeriveResult with derived args or error
 */
export function deriveArgsFromStorage(
  storageJson: string,
  deriveArgs: (data: unknown) => unknown,
): ArgsDeriveResult {
  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Call the args function with extracted data
  try {
    const result = deriveArgs(data);
    return { value: result };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `args() threw: ${errorMsg}` };
  }
}

/**
 * Derives prerunArgs from storage.
 * Uses derivePrerunArgs if provided, otherwise falls back to deriveArgs.
 *
 * @param storageJson - Storage as JSON string
 * @param deriveArgs - The block's args derivation function (fallback)
 * @param derivePrerunArgs - Optional prerun args derivation function
 * @returns ArgsDeriveResult with derived prerunArgs or error
 */
export function derivePrerunArgsFromStorage(
  storageJson: string,
  deriveArgs: (data: unknown) => unknown,
  derivePrerunArgs?: (data: unknown) => unknown,
): ArgsDeriveResult {
  // Extract data from storage
  const { data } = normalizeStorage(storageJson);

  // Try prerunArgs function first if available
  if (derivePrerunArgs) {
    try {
      const result = derivePrerunArgs(data);
      return { value: result };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { error: `prerunArgs() threw: ${errorMsg}` };
    }
  }

  // Fall back to args function
  try {
    const result = deriveArgs(data);
    return { value: result };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `args() threw (fallback): ${errorMsg}` };
  }
}

// =============================================================================
// Template Entry Derivation from Storage
// =============================================================================

/**
 * Derives this block's template-entry params from storage.
 *
 * The inverse of the data model's `init`: `init` turns `params` into data, this
 * turns data back into the params that would recreate it. The lambda returns
 * params in ordinary live form — references as `PlRef`s — and this function
 * projects them into template form, so the reference rewrite is one generic step
 * here rather than per-kind work in every block.
 *
 * A block that declares no `templateParams` yields `{ value: undefined }`: the
 * exporter writes an entry with no `params` and the block re-initializes from its
 * kind's defaults.
 *
 * @param storageJson - Storage as JSON string
 * @param deriveTemplateParams - The block's templateParams lambda, if declared
 * @returns ArgsDeriveResult holding the params in template form, or undefined
 */
export function deriveTemplateParamsFromStorage<TP extends (data: unknown) => unknown>(
  storageJson: string,
  deriveTemplateParams?: TP,
): ArgsDeriveResult {
  if (!deriveTemplateParams) return { value: undefined };

  const { data } = normalizeStorage(storageJson);

  try {
    return { value: toTemplateForm(deriveTemplateParams(data)) };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { error: `templateParams() threw: ${errorMsg}` };
  }
}

// Export discriminator key and schema version for external checks
export { BLOCK_STORAGE_KEY, BLOCK_STORAGE_SCHEMA_VERSION };
