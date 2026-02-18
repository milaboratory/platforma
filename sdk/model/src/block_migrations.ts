export type DataVersionKey = string;
export type DataMigrateFn<From, To> = (prev: Readonly<From>) => To;
export type DataCreateFn<T> = () => T;
export type DataRecoverFn<T> = (version: DataVersionKey, data: unknown) => T;

/** Versioned data wrapper for persistence */
export type DataVersioned<T> = {
  version: DataVersionKey;
  data: T;
};

/** Create a DataVersioned wrapper with correct shape */
export function makeDataVersioned<T>(version: DataVersionKey, data: T): DataVersioned<T> {
  return { version, data };
}

/** Result of migration operation, may include warning if migration failed */
export type DataMigrationResult<T> = DataVersioned<T> & {
  warning?: string;
};

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

/** Internal state passed from builder to DataModel */
type BuilderState<S> = {
  versionChain: DataVersionKey[];
  steps: MigrationStep[];
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
abstract class MigrationChainBase<Current> {
  protected readonly versionChain: DataVersionKey[];
  protected readonly migrationSteps: MigrationStep[];

  protected constructor(state: { versionChain: DataVersionKey[]; steps: MigrationStep[] }) {
    this.versionChain = state.versionChain;
    this.migrationSteps = state.steps;
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
  init(initialData: DataCreateFn<Current>): DataModel<Current> {
    return DataModel[FROM_BUILDER]<Current>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      initialDataFn: initialData,
      ...this.recoverState(),
    });
  }
}

/**
 * Migration chain after recover() has been called.
 * Further migrate() calls are allowed; recover() is not (enforced by type — no recover() method).
 *
 * @typeParam Current - Data type at the current point in the chain
 * @internal
 */
class DataModelMigrationChainWithRecover<Current> extends MigrationChainBase<Current> {
  private readonly recoverFn: (version: DataVersionKey, data: unknown) => unknown;
  private readonly recoverFromIndex: number;

  /** @internal */
  constructor(state: {
    versionChain: DataVersionKey[];
    steps: MigrationStep[];
    recoverFn: (version: DataVersionKey, data: unknown) => unknown;
    recoverFromIndex: number;
  }) {
    super(state);
    this.recoverFn = state.recoverFn;
    this.recoverFromIndex = state.recoverFromIndex;
  }

  protected override recoverState(): RecoverState {
    return { recoverFn: this.recoverFn, recoverFromIndex: this.recoverFromIndex };
  }

  /**
   * Add a migration step. Same semantics as on the base chain.
   * recover() is not available — it has already been called.
   */
  migrate<Next>(
    nextVersion: string,
    fn: DataMigrateFn<Current, Next>,
  ): DataModelMigrationChainWithRecover<Next> {
    const { versionChain, steps } = this.buildStep(nextVersion, fn);
    return new DataModelMigrationChainWithRecover<Next>({
      versionChain,
      steps,
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
 * @internal
 */
class DataModelMigrationChain<Current> extends MigrationChainBase<Current> {
  /** @internal */
  constructor({
    versionChain,
    steps = [],
  }: {
    versionChain: DataVersionKey[];
    steps?: MigrationStep[];
  }) {
    super({ versionChain, steps });
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
  ): DataModelMigrationChain<Next> {
    const { versionChain, steps } = this.buildStep(nextVersion, fn);
    return new DataModelMigrationChain<Next>({ versionChain, steps });
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
  recover(fn: DataRecoverFn<Current>): DataModelMigrationChainWithRecover<Current> {
    return new DataModelMigrationChainWithRecover<Current>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      recoverFn: fn as (version: DataVersionKey, data: unknown) => unknown,
      recoverFromIndex: this.migrationSteps.length,
    });
  }
}

/**
 * Builder entry point for creating DataModel with type-safe migrations.
 *
 * @example
 * // Simple (no migrations):
 * const dataModel = new DataModelBuilder()
 *   .from<BlockData>(DATA_MODEL_DEFAULT_VERSION)
 *   .init(() => ({ numbers: [] }));
 *
 * @example
 * // With migrations:
 * const dataModel = new DataModelBuilder()
 *   .from<BlockDataV1>(DATA_MODEL_DEFAULT_VERSION)
 *   .migrate<BlockDataV2>("v2", (v1) => ({ ...v1, labels: [] }))
 *   .migrate<BlockDataV3>("v3", (v2) => ({ ...v2, description: '' }))
 *   .init(() => ({ numbers: [], labels: [], description: '' }));
 *
 * @example
 * // With recover() between migrations — recovered data goes through remaining migrations:
 * const dataModelChain = new DataModelBuilder()
 *   .from<BlockDataV1>(DATA_MODEL_DEFAULT_VERSION)
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
 */
export class DataModelBuilder {
  /**
   * Start the migration chain with the given initial data type and version key.
   *
   * @typeParam T - Data type for the initial version
   * @param initialVersion - Version key string (e.g. DATA_MODEL_DEFAULT_VERSION or "v1")
   * @returns Migration chain builder
   */
  from<T>(initialVersion: string): DataModelMigrationChain<T> {
    return new DataModelMigrationChain<T>({ versionChain: [initialVersion] });
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
 *   .from<V1>(DATA_MODEL_DEFAULT_VERSION)
 *   .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
 *   .recover((version, data) => {
 *     if (version === "legacy") return transformLegacy(data); // returns V2
 *     return defaultRecover(version, data);
 *   })
 *   .migrate<V3>("v3", (v2) => ({ ...v2, description: "" }))
 *   .init(() => ({ count: 0, label: "", description: "" }));
 */
export class DataModel<State> {
  /** Latest version key — O(1) access for the common "already current" check. */
  private readonly latestVersion: DataVersionKey;
  /** Maps each known version key to the index of the first step to run from it. O(1) lookup. */
  private readonly stepsByFromVersion: ReadonlyMap<DataVersionKey, number>;
  private readonly steps: MigrationStep[];
  private readonly initialDataFn: () => State;
  private readonly recoverFn: (version: DataVersionKey, data: unknown) => unknown;
  private readonly recoverFromIndex: number;

  private constructor({
    versionChain,
    steps,
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
    this.initialDataFn = initialDataFn;
    this.recoverFn = recoverFn;
    this.recoverFromIndex = recoverFromIndex ?? steps.length;
  }

  /**
   * Internal method for creating DataModel from builder.
   * Uses Symbol key to prevent external access.
   * @internal
   */
  static [FROM_BUILDER]<S>(state: BuilderState<S>): DataModel<S> {
    return new DataModel<S>(state);
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
    return makeDataVersioned(this.latestVersion, this.initialDataFn());
  }

  private recoverFrom(data: unknown, version: DataVersionKey): DataMigrationResult<State> {
    // Step 1: call the recover function to get data at the recover point
    let currentData: unknown;
    try {
      currentData = this.recoverFn(version, data);
    } catch (error) {
      if (isDataUnrecoverableError(error)) {
        return { ...this.getDefaultData(), warning: error.message };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        ...this.getDefaultData(),
        warning: `Recover failed for version '${version}': ${errorMessage}`,
      };
    }

    // Step 2: run any migrations that were added after recover() in the chain
    for (let i = this.recoverFromIndex; i < this.steps.length; i++) {
      const step = this.steps[i];
      try {
        currentData = step.migrate(currentData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ...this.getDefaultData(),
          warning: `Migration ${step.fromVersion}→${step.toVersion} failed: ${errorMessage}`,
        };
      }
    }

    return { version: this.latestVersion, data: currentData as State };
  }

  /**
   * Migrate versioned data from any version to the latest.
   *
   * - If version is in chain, applies needed migrations (O(1) lookup)
   * - If version is unknown, calls recover function then runs remaining migrations
   * - If migration/recovery fails, returns default data with warning
   *
   * @param versioned - Data with version tag
   * @returns Migration result with data at latest version
   */
  migrate(versioned: DataVersioned<unknown>): DataMigrationResult<State> {
    const { version: fromVersion, data } = versioned;

    if (fromVersion === this.latestVersion) {
      return { version: this.latestVersion, data: data as State };
    }

    const startIndex = this.stepsByFromVersion.get(fromVersion);
    if (startIndex === undefined) {
      return this.recoverFrom(data, fromVersion);
    }

    let currentData: unknown = data;
    for (let i = startIndex; i < this.steps.length; i++) {
      const step = this.steps[i];
      try {
        currentData = step.migrate(currentData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ...this.getDefaultData(),
          warning: `Migration ${step.fromVersion}→${step.toVersion} failed: ${errorMessage}`,
        };
      }
    }

    return { version: this.latestVersion, data: currentData as State };
  }
}
