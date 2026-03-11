import { DATA_MODEL_LEGACY_VERSION } from "./block_storage";

export type DataVersionKey = string;
export type DataMigrateFn<From, To> = (prev: Readonly<From>) => To;
export type DataCreateFn<T> = () => T;
export type DataRecoverFn<T> = (version: DataVersionKey, data: unknown) => T;

/**
 * Minimal interface that .transfer() accepts. PluginInstance implements this.
 * Defined here to avoid circular dependency with plugin_model.ts.
 */
export interface TransferTarget<Id extends string = string, TransferData = never> {
  readonly id: Id;
  /** Version key in the plugin's data model chain where transferred data enters. */
  readonly transferVersion: string;
  /** @internal Phantom field for TransferData type extraction */
  readonly __transferBrand?: TransferData;
}

/** Internal record of a single transfer step in the migration chain. */
export type TransferStep = {
  pluginId: string;
  /** Capture data before this step index executes. */
  beforeStepIndex: number;
  extract: (data: unknown) => unknown;
  /** Version key in the plugin's data model chain where the transferred data enters. */
  targetVersion: string;
};

/** Map of plugin ID → versioned data extracted during migration. */
export type TransferRecord = Record<string, DataVersioned<unknown>>;

/** Versioned data wrapper for persistence */
export type DataVersioned<T> = {
  version: DataVersionKey;
  data: T;
};

/** Create a DataVersioned wrapper with correct shape */
export function makeVersionedData<T>(version: DataVersionKey, data: T): DataVersioned<T> {
  return { version, data };
}

/** Thrown when a migration step fails. */
export class DataMigrationError extends Error {
  name = "DataMigrationError";
  constructor(message: string) {
    super(message);
  }
}

/** Thrown by recover() to signal unrecoverable data. */
export class DataUnrecoverableError extends Error {
  name = "DataUnrecoverableError";
  constructor(dataVersion: DataVersionKey) {
    super(`Unknown version '${dataVersion}'`);
  }
}

export function isDataUnrecoverableError(error: unknown): error is DataUnrecoverableError {
  return error instanceof Error && error.name === "DataUnrecoverableError";
}

type MigrationStep = {
  fromVersion: DataVersionKey;
  toVersion: DataVersionKey;
  migrate: (data: unknown) => unknown;
};

/**
 * Default recover function for unknown versions.
 * Use as fallback at the end of custom recover functions.
 *
 * @example
 * .recover((version, data) => {
 *   if (version === 'legacy') {
 *     return transformLegacyData(data);
 *   }
 *   return defaultRecover(version, data);
 * })
 */
export const defaultRecover: DataRecoverFn<never> = (version, _data) => {
  throw new DataUnrecoverableError(version);
};

/** Symbol for internal builder creation method */
const FROM_BUILDER = Symbol("fromBuilder");

/** Legacy V1 model state shape: { args, uiState } */
export type LegacyV1State<Args, UiState> = { args: Args; uiState: UiState };

/** Internal state passed from builder to DataModel */
type BuilderState<S> = {
  versionChain: DataVersionKey[];
  steps: MigrationStep[];
  transferSteps: TransferStep[];
  initialDataFn: () => S;
  recoverFn?: (version: DataVersionKey, data: unknown) => unknown;
  /** Index of the first step to run after recovery. Equals the number of steps
   *  present at the time recover() was called. */
  recoverFromIndex?: number;
};

type RecoverState = {
  recoverFn?: (version: DataVersionKey, data: unknown) => unknown;
  recoverFromIndex?: number;
};

/**
 * Abstract base for both migration chain types.
 * Holds shared state, buildStep() helper, and init().
 * migrate() cannot be shared due to a TypeScript limitation: when the base class
 * migrate() return type is abstract, subclasses cannot narrow it without losing type safety.
 * Each subclass therefore owns its migrate() with the correct concrete return type.
 *
 * @internal
 */
abstract class MigrationChainBase<Current, Transfers extends Record<string, unknown> = {}> {
  protected readonly versionChain: DataVersionKey[];
  protected readonly migrationSteps: MigrationStep[];
  protected readonly transferSteps: TransferStep[];

  protected constructor(state: {
    versionChain: DataVersionKey[];
    steps: MigrationStep[];
    transferSteps?: TransferStep[];
  }) {
    this.versionChain = state.versionChain;
    this.migrationSteps = state.steps;
    this.transferSteps = state.transferSteps ?? [];
  }

  /** Appends a migration step and returns the new versionChain and steps arrays. */
  protected buildStep<Next>(
    nextVersion: string,
    fn: DataMigrateFn<Current, Next>,
  ): { versionChain: DataVersionKey[]; steps: MigrationStep[] } {
    if (this.versionChain.includes(nextVersion)) {
      throw new Error(`Duplicate version '${nextVersion}' in migration chain`);
    }
    const fromVersion = this.versionChain[this.versionChain.length - 1];
    const step: MigrationStep = {
      fromVersion,
      toVersion: nextVersion,
      migrate: fn as (data: unknown) => unknown,
    };
    return {
      versionChain: [...this.versionChain, nextVersion],
      steps: [...this.migrationSteps, step],
    };
  }

  /** Validates uniqueness and records a TransferStep. */
  protected buildTransfer<Id extends string, L>(
    target: TransferTarget<Id, L>,
    extract: (data: Current) => L,
  ): { transferSteps: TransferStep[] } {
    if (this.transferSteps.some((t) => t.pluginId === target.id)) {
      throw new Error(`Duplicate transfer for plugin '${target.id}'`);
    }
    const entry: TransferStep = {
      pluginId: target.id,
      beforeStepIndex: this.migrationSteps.length,
      extract: extract as (data: unknown) => unknown,
      targetVersion: target.transferVersion,
    };
    return { transferSteps: [...this.transferSteps, entry] };
  }

  /** Returns recover-specific fields for DataModel construction. Overridden by WithRecover. */
  protected recoverState(): RecoverState {
    return {};
  }

  /**
   * Finalize the DataModel with initial data factory.
   *
   * @param initialData - Factory function returning the initial state
   * @returns Finalized DataModel instance
   */
  init(initialData: DataCreateFn<Current>): DataModel<Current, Transfers> {
    return DataModel[FROM_BUILDER]<Current, Transfers>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      transferSteps: this.transferSteps,
      initialDataFn: initialData,
      ...this.recoverState(),
    });
  }
}

/**
 * Migration chain after recover() or upgradeLegacy() has been called.
 * Further migrate() and transfer() calls are allowed; recover() and upgradeLegacy() are not
 * (enforced by type — no such methods on this class).
 *
 * @typeParam Current - Data type at the current point in the chain
 * @typeParam Transfers - Accumulated transfer types keyed by plugin ID
 * @internal
 */
class DataModelMigrationChainWithRecover<
  Current,
  Transfers extends Record<string, unknown> = {},
> extends MigrationChainBase<Current, Transfers> {
  private readonly recoverFn?: (version: DataVersionKey, data: unknown) => unknown;
  private readonly recoverFromIndex?: number;

  /** @internal */
  constructor(state: {
    versionChain: DataVersionKey[];
    steps: MigrationStep[];
    transferSteps?: TransferStep[];
    recoverFn?: (version: DataVersionKey, data: unknown) => unknown;
    recoverFromIndex?: number;
  }) {
    super(state);
    this.recoverFn = state.recoverFn;
    this.recoverFromIndex = state.recoverFromIndex;
  }

  protected override recoverState(): RecoverState {
    return {
      recoverFn: this.recoverFn,
      recoverFromIndex: this.recoverFromIndex,
    };
  }

  /**
   * Add a migration step. Same semantics as on the base chain.
   * recover() and upgradeLegacy() are not available — one has already been called.
   */
  migrate<Next>(
    nextVersion: string,
    fn: DataMigrateFn<Current, Next>,
  ): DataModelMigrationChainWithRecover<Next, Transfers> {
    const { versionChain, steps } = this.buildStep(nextVersion, fn);
    return new DataModelMigrationChainWithRecover<Next, Transfers>({
      versionChain,
      steps,
      transferSteps: this.transferSteps,
      recoverFn: this.recoverFn,
      recoverFromIndex: this.recoverFromIndex,
    });
  }

  /**
   * Extract data at the current chain position for seeding a new plugin.
   * The extract function's return type must match the plugin's transfer data type.
   * Duplicate plugin IDs are rejected at both type and runtime level.
   */
  transfer<Id extends string, L>(
    target: TransferTarget<Id & (Id extends keyof Transfers ? never : string), L>,
    extract: (data: Current) => L,
  ): DataModelMigrationChainWithRecover<Current, Transfers & Record<Id, L>> {
    const { transferSteps } = this.buildTransfer(target, extract);
    return new DataModelMigrationChainWithRecover<Current, Transfers & Record<Id, L>>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      transferSteps,
      recoverFn: this.recoverFn,
      recoverFromIndex: this.recoverFromIndex,
    });
  }
}

/**
 * Migration chain builder.
 * Each migrate() call advances the current data type. recover() can be called once
 * at any point — it removes itself from the returned chain so it cannot be called again.
 * Duplicate version keys throw at runtime.
 *
 * @typeParam Current - Data type at the current point in the migration chain
 * @typeParam Transfers - Accumulated transfer types keyed by plugin ID
 * @internal
 */
class DataModelMigrationChain<
  Current,
  Transfers extends Record<string, unknown> = {},
> extends MigrationChainBase<Current, Transfers> {
  /** @internal */
  constructor({
    versionChain,
    steps = [],
    transferSteps = [],
  }: {
    versionChain: DataVersionKey[];
    steps?: MigrationStep[];
    transferSteps?: TransferStep[];
  }) {
    super({ versionChain, steps, transferSteps });
  }

  /**
   * Add a migration step transforming data from the current version to the next.
   *
   * @typeParam Next - Data type of the next version
   * @param nextVersion - Version key to migrate to (must be unique in the chain)
   * @param fn - Migration function
   * @returns Builder with the next version as current
   *
   * @example
   * .migrate<BlockDataV2>("v2", (v1) => ({ ...v1, labels: [] }))
   */
  migrate<Next>(
    nextVersion: string,
    fn: DataMigrateFn<Current, Next>,
  ): DataModelMigrationChain<Next, Transfers> {
    const { versionChain, steps } = this.buildStep(nextVersion, fn);
    return new DataModelMigrationChain<Next, Transfers>({
      versionChain,
      steps,
      transferSteps: this.transferSteps,
    });
  }

  /**
   * Extract data at the current chain position for seeding a new plugin.
   * The extract function's return type must match the plugin's transfer data type.
   * Duplicate plugin IDs are rejected at both type and runtime level.
   *
   * Calling .transfer() on DataModelInitialChain returns DataModelMigrationChain,
   * which removes .upgradeLegacy() from the chain (preventing a problematic combination).
   *
   * @example
   * .from<V1>("v1")
   * .transfer(tablePlugin, (v1) => ({ state: v1.tableState }))
   * .migrate<V2>("v2", ({ tableState: _, ...rest }) => rest)
   */
  transfer<Id extends string, L>(
    target: TransferTarget<Id & (Id extends keyof Transfers ? never : string), L>,
    extract: (data: Current) => L,
  ): DataModelMigrationChain<Current, Transfers & Record<Id, L>> {
    const { transferSteps } = this.buildTransfer(target, extract);
    return new DataModelMigrationChain<Current, Transfers & Record<Id, L>>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      transferSteps,
    });
  }

  /**
   * Set a recovery handler for unknown or legacy versions.
   *
   * The recover function is called when data has a version not in the migration chain.
   * It must return data of the type at this point in the chain (Current). Any migrate()
   * steps added after recover() will then run on the recovered data.
   *
   * Can only be called once — the returned chain has no recover() method.
   *
   * @param fn - Recovery function returning Current (the type at this chain position)
   * @returns Builder with migrate() and init() but without recover()
   *
   * @example
   * // Recover between migrations — recovered data goes through v3 migration
   * new DataModelBuilder<V1>("v1")
   *   .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
   *   .recover((version, data) => {
   *     if (version === 'legacy') return transformLegacy(data); // returns V2
   *     return defaultRecover(version, data);
   *   })
   *   .migrate<V3>("v3", (v2) => ({ ...v2, description: "" }))
   *   .init(() => ({ count: 0, label: "", description: "" }));
   */
  recover(fn: DataRecoverFn<Current>): DataModelMigrationChainWithRecover<Current, Transfers> {
    return new DataModelMigrationChainWithRecover<Current, Transfers>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      transferSteps: this.transferSteps,
      recoverFn: fn as (version: DataVersionKey, data: unknown) => unknown,
      recoverFromIndex: this.migrationSteps.length,
    });
  }
}

/**
 * Initial migration chain returned by `.from()`.
 * Extends DataModelMigrationChain with `upgradeLegacy()` — available only before
 * any `.migrate()` calls, since legacy data always arrives at the initial version.
 *
 * @typeParam Current - Data type at the initial version
 * @typeParam Transfers - Accumulated transfer types keyed by plugin ID
 * @internal
 */
class DataModelInitialChain<
  Current,
  Transfers extends Record<string, unknown> = {},
> extends DataModelMigrationChain<Current, Transfers> {
  /**
   * Handle legacy V1 model state ({ args, uiState }) when upgrading a block from
   * BlockModel V1 to BlockModelV3.
   *
   * When a V1 block is upgraded, its stored state `{ args, uiState }` is normalized
   * to the internal default version. This method inserts a migration step from that
   * internal version to the version specified in `.from()`, using the provided typed
   * callback to transform the legacy shape. Non-legacy data passes through unchanged.
   *
   * Must be called right after `.from()` — not available after `.migrate()` calls.
   * Any `.migrate()` steps added after `upgradeLegacy()` will run on the transformed result.
   *
   * Can only be called once — the returned chain has no upgradeLegacy() method.
   * Mutually exclusive with recover().
   *
   * @typeParam Args - Type of the legacy block args
   * @typeParam UiState - Type of the legacy block uiState
   * @param fn - Typed transform from { args, uiState } to Current
   * @returns Builder with migrate() and init() but without recover() or upgradeLegacy()
   *
   * @example
   * type OldArgs = { inputFile: string; threshold: number };
   * type OldUiState = { selectedTab: string };
   * type BlockData = { inputFile: string; threshold: number; selectedTab: string };
   *
   * const dataModel = new DataModelBuilder()
   *   .from<BlockData>("v1")
   *   .upgradeLegacy<OldArgs, OldUiState>(({ args, uiState }) => ({
   *     inputFile: args.inputFile,
   *     threshold: args.threshold,
   *     selectedTab: uiState.selectedTab,
   *   }))
   *   .init(() => ({ inputFile: '', threshold: 0, selectedTab: 'main' }));
   */
  upgradeLegacy<Args, UiState = unknown>(
    fn: (legacy: LegacyV1State<Args, UiState>) => Current,
  ): DataModelMigrationChainWithRecover<Current, Transfers> {
    const wrappedFn = (data: unknown): unknown => {
      if (data !== null && typeof data === "object" && "args" in data) {
        return fn(data as LegacyV1State<Args, UiState>);
      }
      return data;
    };

    // Insert DATA_MODEL_LEGACY_VERSION as the true first version
    // with a migration step that transforms legacy data to the user's initial version.
    const initialVersion = this.versionChain[0];
    const step: MigrationStep = {
      fromVersion: DATA_MODEL_LEGACY_VERSION,
      toVersion: initialVersion,
      migrate: wrappedFn,
    };
    return new DataModelMigrationChainWithRecover<Current, Transfers>({
      versionChain: [DATA_MODEL_LEGACY_VERSION, ...this.versionChain],
      steps: [step, ...this.migrationSteps],
      // Shift transfer indices to account for the prepended legacy step
      transferSteps: this.transferSteps.map((t) => ({
        ...t,
        beforeStepIndex: t.beforeStepIndex + 1,
      })),
    });
  }
}

/**
 * Builder entry point for creating DataModel with type-safe migrations.
 *
 * @example
 * // Simple (no migrations):
 * const dataModel = new DataModelBuilder()
 *   .from<BlockData>("v1")
 *   .init(() => ({ numbers: [] }));
 *
 * @example
 * // With migrations:
 * const dataModel = new DataModelBuilder()
 *   .from<BlockDataV1>("v1")
 *   .migrate<BlockDataV2>("v2", (v1) => ({ ...v1, labels: [] }))
 *   .migrate<BlockDataV3>("v3", (v2) => ({ ...v2, description: '' }))
 *   .init(() => ({ numbers: [], labels: [], description: '' }));
 *
 * @example
 * // With recover() between migrations — recovered data goes through remaining migrations:
 * const dataModelChain = new DataModelBuilder()
 *   .from<BlockDataV1>("v1")
 *   .migrate<BlockDataV2>("v2", (v1) => ({ ...v1, labels: [] }));
 *
 * // recover() placed before the v3 migration: recovered data goes through v3
 * const dataModel = dataModelChain
 *   .recover((version, data) => {
 *     if (version === 'legacy' && isLegacyData(data)) return transformLegacy(data); // returns V2
 *     return defaultRecover(version, data);
 *   })
 *   .migrate<BlockDataV3>("v3", (v2) => ({ ...v2, description: '' }))
 *   .init(() => ({ numbers: [], labels: [], description: '' }));
 *
 * @example
 * // With upgradeLegacy() — typed upgrade from BlockModel V1 state:
 * type OldArgs = { inputFile: string };
 * type OldUiState = { selectedTab: string };
 * type BlockData = { inputFile: string; selectedTab: string };
 *
 * const dataModel = new DataModelBuilder()
 *   .from<BlockData>("v1")
 *   .upgradeLegacy<OldArgs, OldUiState>(({ args, uiState }) => ({
 *     inputFile: args.inputFile,
 *     selectedTab: uiState.selectedTab,
 *   }))
 *   .init(() => ({ inputFile: '', selectedTab: 'main' }));
 */
export class DataModelBuilder {
  /**
   * Start the migration chain with the given initial data type and version key.
   *
   * @typeParam T - Data type for the initial version
   * @param initialVersion - Version key string (e.g. "v1")
   * @returns Migration chain builder
   */
  from<T>(initialVersion: string): DataModelInitialChain<T> {
    return new DataModelInitialChain<T>({ versionChain: [initialVersion] });
  }
}

/**
 * DataModel defines the block's data structure, initial values, and migrations.
 * Used by BlockModelV3 to manage data state.
 *
 * Use `new DataModelBuilder()` to create a DataModel.
 *
 * @example
 * // With recover() between migrations:
 * // Recovered data (V2) goes through the v2→v3 migration automatically.
 * const dataModel = new DataModelBuilder()
 *   .from<V1>("v1")
 *   .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
 *   .recover((version, data) => {
 *     if (version === "legacy") return transformLegacy(data); // returns V2
 *     return defaultRecover(version, data);
 *   })
 *   .migrate<V3>("v3", (v2) => ({ ...v2, description: "" }))
 *   .init(() => ({ count: 0, label: "", description: "" }));
 */
export class DataModel<State, Transfers extends Record<string, unknown> = {}> {
  /** @internal Phantom field to anchor the Transfers type parameter. */
  declare readonly __transfers?: Transfers;

  /** Latest version key — O(1) access for the common "already current" check. */
  private readonly latestVersion: DataVersionKey;
  /** Maps each known version key to the index of the first step to run from it. O(1) lookup. */
  private readonly stepsByFromVersion: ReadonlyMap<DataVersionKey, number>;
  private readonly steps: MigrationStep[];
  private readonly transferSteps: TransferStep[];
  private readonly initialDataFn: () => State;
  private readonly recoverFn: (version: DataVersionKey, data: unknown) => unknown;
  private readonly recoverFromIndex: number;

  private constructor({
    versionChain,
    steps,
    transferSteps = [],
    initialDataFn,
    recoverFn = defaultRecover,
    recoverFromIndex,
  }: BuilderState<State>) {
    if (versionChain.length === 0) {
      throw new Error("DataModel requires at least one version key");
    }
    this.latestVersion = versionChain[versionChain.length - 1];
    this.stepsByFromVersion = new Map(versionChain.map((v, i) => [v, i]));
    this.steps = steps;
    this.transferSteps = transferSteps;
    this.initialDataFn = initialDataFn;
    this.recoverFn = recoverFn;
    this.recoverFromIndex = recoverFromIndex ?? steps.length;
  }

  /**
   * Internal method for creating DataModel from builder.
   * Uses Symbol key to prevent external access.
   * @internal
   */
  static [FROM_BUILDER]<S, T extends Record<string, unknown> = {}>(
    state: BuilderState<S>,
  ): DataModel<S, T> {
    return new DataModel<S, T>(state);
  }

  /**
   * The latest (current) version key in the migration chain.
   */
  get version(): DataVersionKey {
    return this.latestVersion;
  }

  /**
   * Get a fresh copy of the initial data.
   */
  initialData(): State {
    return this.initialDataFn();
  }

  /**
   * Get initial data wrapped with current version.
   * Used when creating new blocks or resetting to defaults.
   */
  getDefaultData(): DataVersioned<State> {
    return makeVersionedData(this.latestVersion, this.initialDataFn());
  }

  private recoverFrom(data: unknown, version: DataVersionKey): DataVersioned<State> {
    // Step 1: call the recover function to get data at the recover point
    // Let errors (including DataUnrecoverableError) propagate to the caller.
    let currentData: unknown = this.recoverFn(version, data);

    // Step 2: run any migrations that were added after recover() in the chain
    for (let i = this.recoverFromIndex; i < this.steps.length; i++) {
      const step = this.steps[i];
      currentData = step.migrate(currentData);
    }

    return { version: this.latestVersion, data: currentData as State };
  }

  /**
   * Migrate versioned data from any version to the latest.
   * Collects transfer extractions at their designated chain positions.
   *
   * - If version is in chain, applies needed migrations (O(1) lookup)
   * - If version is unknown, attempts recovery; falls back to initial data
   * - If a migration step fails, throws so the caller can preserve original data
   *
   * Transfers only fire during normal step-by-step migration:
   * - Recovery path: returns empty transfers
   * - Fast-path (already at latest): returns empty transfers
   *
   * @param versioned - Data with version tag
   * @returns Migrated data at the latest version with transfer record
   * @throws If a migration step from a known version fails
   */
  migrate(versioned: DataVersioned<unknown>): DataVersioned<State> & { transfers: TransferRecord } {
    const { version: fromVersion, data } = versioned;

    // Fast path: already at latest version
    if (fromVersion === this.latestVersion) {
      return { version: this.latestVersion, data: data as State, transfers: {} };
    }

    // Unknown version: recovery path — empty transfers
    const startIndex = this.stepsByFromVersion.get(fromVersion);
    if (startIndex === undefined) {
      try {
        return { ...this.recoverFrom(data, fromVersion), transfers: {} };
      } catch {
        // Recovery failed (unknown version, recover fn threw, or post-recover
        // migration failed) — reset to initial data rather than blocking the update.
        return { ...this.getDefaultData(), transfers: {} };
      }
    }

    let currentData: unknown = data;
    const transfers: TransferRecord = {};

    // Run steps and check transfer entries before each step
    for (let i = startIndex; i < this.steps.length; i++) {
      for (const t of this.transferSteps) {
        if (t.beforeStepIndex === i) {
          transfers[t.pluginId] = {
            version: t.targetVersion,
            data: t.extract(currentData),
          };
        }
      }
      currentData = this.steps[i].migrate(currentData);
    }

    // Check for transfers positioned at or past the end of the steps array
    // (e.g., .transfer() was the last call before .init(), after all .migrate() calls)
    for (const t of this.transferSteps) {
      if (t.beforeStepIndex >= this.steps.length && t.beforeStepIndex >= startIndex) {
        transfers[t.pluginId] = {
          version: t.targetVersion,
          data: t.extract(currentData),
        };
      }
    }

    return { version: this.latestVersion, data: currentData as State, transfers };
  }
}
