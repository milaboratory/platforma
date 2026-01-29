import { tryRegisterCallback } from './internal';
import { createBlockStorage } from './block_storage';

export type DataVersionKey = string;
export type DataVersionMap = Record<string, unknown>;
export type DataMigrateFn<From, To> = (prev: Readonly<From>) => To;
export type DataCreateFn<T> = () => T;
export type DataRecoverFn<T> = (version: DataVersionKey, data: unknown) => T;

/**
 * Helper to define version keys with literal type inference and runtime validation.
 * - Validates that all version values are unique
 * - Validates that no version value is empty
 * - Eliminates need for `as const` assertion
 *
 * @throws Error if duplicate or empty version values are found
 *
 * @example
 * const Version = defineDataVersions({
 *   Initial: 'v1',
 *   AddedLabels: 'v2',
 * });
 *
 * type VersionedData = {
 *   [Version.Initial]: DataV1;
 *   [Version.AddedLabels]: DataV2;
 * };
 */
export function defineDataVersions<const T extends Record<string, string>>(versions: T): T {
  const values = Object.values(versions) as (string & keyof T)[];
  const keys = Object.keys(versions) as (keyof T)[];
  const emptyKeys = keys.filter((key) => versions[key] === '');
  if (emptyKeys.length > 0) {
    throw new Error(`Version values must be non-empty strings (empty: ${emptyKeys.join(', ')})`);
  }
  const unique = new Set(values);
  if (unique.size !== values.length) {
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
    throw new Error(`Duplicate version values: ${[...new Set(duplicates)].join(', ')}`);
  }
  return versions;
}

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
  name = 'DataUnrecoverableError';
  constructor(dataVersion: DataVersionKey) {
    super(`Unknown version '${dataVersion}'`);
  }
}

export function isDataUnrecoverableError(error: unknown): error is DataUnrecoverableError {
  return error instanceof Error && error.name === 'DataUnrecoverableError';
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
const FROM_BUILDER = Symbol('fromBuilder');

/** Internal state passed from builder to DataModel */
type BuilderState<S> = {
  versionChain: DataVersionKey[];
  steps: MigrationStep[];
  initialDataFn: () => S;
  recoverFn?: DataRecoverFn<S>;
};

/**
 * Final builder state after recover() is called.
 * Only allows calling create() to finalize the DataModel.
 *
 * @typeParam VersionedData - Map of version keys to their data types
 * @typeParam CurrentVersion - The current (final) version in the chain
 * @internal
 */
class DataModelBuilderWithRecover<
  VersionedData extends DataVersionMap,
  CurrentVersion extends keyof VersionedData & string,
> {
  private readonly versionChain: DataVersionKey[];
  private readonly migrationSteps: MigrationStep[];
  private readonly recoverFn: DataRecoverFn<VersionedData[CurrentVersion]>;

  /** @internal */
  constructor({
    versionChain,
    steps,
    recoverFn,
  }: {
    versionChain: DataVersionKey[];
    steps: MigrationStep[];
    recoverFn: DataRecoverFn<VersionedData[CurrentVersion]>;
  }) {
    this.versionChain = versionChain;
    this.migrationSteps = steps;
    this.recoverFn = recoverFn;
  }

  /**
   * Finalize the DataModel with initial data factory.
   *
   * The initial data factory is called when creating new blocks or when
   * migration/recovery fails and data must be reset.
   *
   * @param initialData - Factory function returning initial state (must exactly match CurrentVersion's data type)
   * @returns Finalized DataModel instance
   *
   * @example
   * .init(() => ({ numbers: [], labels: [], description: '' }))
   */
  init<S extends VersionedData[CurrentVersion]>(
    initialData: DataCreateFn<S>,
    // Compile-time check: S must have exactly the same keys as VersionedData[CurrentVersion]
    ..._noExtraKeys: Exclude<keyof S, keyof VersionedData[CurrentVersion]> extends never
      ? []
      : [never]
  ): DataModel<VersionedData[CurrentVersion]> {
    return DataModel[FROM_BUILDER]<VersionedData[CurrentVersion]>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      initialDataFn: initialData as DataCreateFn<VersionedData[CurrentVersion]>,
      recoverFn: this.recoverFn,
    });
  }
}

/**
 * Internal builder for constructing DataModel with type-safe migration chains.
 *
 * Tracks the current version through the generic type system, ensuring:
 * - Migration functions receive correctly typed input
 * - Migration functions must return the correct output type
 * - Version keys must exist in the VersionedData map
 * - All versions must be covered before calling init()
 *
 * @typeParam VersionedData - Map of version keys to their data types
 * @typeParam CurrentVersion - The current version in the migration chain
 * @typeParam RemainingVersions - Versions not yet covered by migrations
 * @internal
 */
class DataModelMigrationChain<
  VersionedData extends DataVersionMap,
  CurrentVersion extends keyof VersionedData & string,
  RemainingVersions extends keyof VersionedData & string = Exclude<
    keyof VersionedData & string,
    CurrentVersion
  >,
> {
  private readonly versionChain: DataVersionKey[];
  private readonly migrationSteps: MigrationStep[];

  /** @internal */
  constructor({
    versionChain,
    steps = [],
  }: {
    versionChain: DataVersionKey[];
    steps?: MigrationStep[];
  }) {
    this.versionChain = versionChain;
    this.migrationSteps = steps;
  }

  /**
   * Add a migration step to transform data from current version to next version.
   *
   * Migration functions:
   * - Receive data typed as the current version's data type (readonly)
   * - Must return data matching the target version's data type
   * - Should be pure functions (no side effects)
   * - May throw errors (will result in data reset with warning)
   *
   * @typeParam NextVersion - The target version key (must be in RemainingVersions)
   * @param nextVersion - The version key to migrate to
   * @param fn - Migration function transforming current data to next version
   * @returns Builder with updated current version
   *
   * @example
   * .migrate(Version.V2, (data) => ({ ...data, labels: [] }))
   */
  migrate<NextVersion extends RemainingVersions>(
    nextVersion: NextVersion,
    fn: DataMigrateFn<VersionedData[CurrentVersion], VersionedData[NextVersion]>,
  ): DataModelMigrationChain<VersionedData, NextVersion, Exclude<RemainingVersions, NextVersion>> {
    if (this.versionChain.includes(nextVersion)) {
      throw new Error(`Duplicate version '${nextVersion}' in migration chain`);
    }
    const fromVersion = this.versionChain[this.versionChain.length - 1];
    const step: MigrationStep = {
      fromVersion,
      toVersion: nextVersion,
      migrate: fn as (data: unknown) => unknown,
    };
    return new DataModelMigrationChain<
      VersionedData,
      NextVersion,
      Exclude<RemainingVersions, NextVersion>
    >({
      versionChain: [...this.versionChain, nextVersion],
      steps: [...this.migrationSteps, step],
    });
  }

  /**
   * Set a recovery handler for unknown or legacy versions.
   *
   * The recover function is called when data has a version not in the migration chain.
   * It should either:
   * - Transform the data to the current version's format and return it
   * - Call `defaultRecover(version, data)` to signal unrecoverable data
   *
   * Can only be called once. After calling, only `init()` is available.
   *
   * @param fn - Recovery function that transforms unknown data or throws
   * @returns Builder with only init() method available
   *
   * @example
   * .recover((version, data) => {
   *   if (version === 'legacy' && isLegacyFormat(data)) {
   *     return transformLegacy(data);
   *   }
   *   return defaultRecover(version, data);
   * })
   */
  recover(
    fn: DataRecoverFn<VersionedData[CurrentVersion]>,
  ): DataModelBuilderWithRecover<VersionedData, CurrentVersion> {
    return new DataModelBuilderWithRecover<VersionedData, CurrentVersion>({
      versionChain: [...this.versionChain],
      steps: [...this.migrationSteps],
      recoverFn: fn,
    });
  }

  /**
   * Finalize the DataModel with initial data factory.
   *
   * Can only be called when all versions in VersionedData have been covered
   * by the migration chain (RemainingVersions is empty).
   *
   * The initial data factory is called when creating new blocks or when
   * migration/recovery fails and data must be reset.
   *
   * @param initialData - Factory function returning initial state (must exactly match CurrentVersion's data type)
   * @returns Finalized DataModel instance
   *
   * @example
   * .init(() => ({ numbers: [], labels: [], description: '' }))
   */
  init<S extends VersionedData[CurrentVersion]>(
    // Compile-time check: RemainingVersions must be empty (all versions covered)
    this: DataModelMigrationChain<VersionedData, CurrentVersion, never>,
    initialData: DataCreateFn<S>,
    // Compile-time check: S must have exactly the same keys as VersionedData[CurrentVersion]
    ..._noExtraKeys: Exclude<keyof S, keyof VersionedData[CurrentVersion]> extends never
      ? []
      : [never]
  ): DataModel<VersionedData[CurrentVersion]> {
    return DataModel[FROM_BUILDER]<VersionedData[CurrentVersion]>({
      versionChain: this.versionChain,
      steps: this.migrationSteps,
      initialDataFn: initialData as DataCreateFn<VersionedData[CurrentVersion]>,
    });
  }
}

/**
 * Builder entry point for creating DataModel with type-safe migrations.
 *
 * @typeParam VersionedData - Map of version keys to their data types
 *
 * @example
 * const Version = defineDataVersions({
 *   V1: 'v1',
 *   V2: 'v2',
 * });
 *
 * type VersionedData = {
 *   [Version.V1]: { count: number };
 *   [Version.V2]: { count: number; label: string };
 * };
 *
 * const dataModel = new DataModelBuilder<VersionedData>()
 *   .from(Version.V1)
 *   .migrate(Version.V2, (data) => ({ ...data, label: '' }))
 *   .init(() => ({ count: 0, label: '' }));
 */
export class DataModelBuilder<VersionedData extends DataVersionMap> {
  /**
   * Start a migration chain from an initial version.
   *
   * @typeParam InitialVersion - The starting version key (inferred from argument)
   * @param initialVersion - The version key to start from
   * @returns Migration chain builder for adding migrations
   *
   * @example
   * new DataModelBuilder<VersionedData>()
   *   .from(Version.V1)
   *   .migrate(Version.V2, (data) => ({ ...data, newField: '' }))
   */
  from<InitialVersion extends keyof VersionedData & string>(
    initialVersion: InitialVersion,
  ): DataModelMigrationChain<
      VersionedData,
      InitialVersion,
      Exclude<keyof VersionedData & string, InitialVersion>
    > {
    return new DataModelMigrationChain<
      VersionedData,
      InitialVersion,
      Exclude<keyof VersionedData & string, InitialVersion>
    >({ versionChain: [initialVersion] });
  }
}

/**
 * DataModel defines the block's data structure, initial values, and migrations.
 * Used by BlockModelV3 to manage data state.
 *
 * Use `new DataModelBuilder<VersionedData>()` to create a DataModel:
 *
 * **Simple (no migrations):**
 * @example
 * const Version = defineDataVersions({ V1: DATA_MODEL_DEFAULT_VERSION });
 * type VersionedData = { [Version.V1]: BlockData };
 *
 * const dataModel = new DataModelBuilder<VersionedData>()
 *   .from(Version.V1)
 *   .init(() => ({ numbers: [], labels: [] }));
 *
 * **With migrations:**
 * @example
 * const Version = defineDataVersions({
 *   V1: DATA_MODEL_DEFAULT_VERSION,
 *   V2: 'v2',
 *   V3: 'v3',
 * });
 *
 * type VersionedData = {
 *   [Version.V1]: { numbers: number[] };
 *   [Version.V2]: { numbers: number[]; labels: string[] };
 *   [Version.V3]: { numbers: number[]; labels: string[]; description: string };
 * };
 *
 * const dataModel = new DataModelBuilder<VersionedData>()
 *   .from(Version.V1)
 *   .migrate(Version.V2, (data) => ({ ...data, labels: [] }))
 *   .migrate(Version.V3, (data) => ({ ...data, description: '' }))
 *   .recover((version, data) => {
 *     if (version === 'legacy' && typeof data === 'object' && data !== null && 'numbers' in data) {
 *       return { numbers: (data as { numbers: number[] }).numbers, labels: [], description: '' };
 *     }
 *     return defaultRecover(version, data);
 *   })
 *   .init(() => ({ numbers: [], labels: [], description: '' }));
 */
export class DataModel<State> {
  private readonly versionChain: DataVersionKey[];
  private readonly steps: MigrationStep[];
  private readonly initialDataFn: () => State;
  private readonly recoverFn: DataRecoverFn<State>;

  private constructor({
    versionChain,
    steps,
    initialDataFn,
    recoverFn = defaultRecover as DataRecoverFn<State>,
  }: {
    versionChain: DataVersionKey[];
    steps: MigrationStep[];
    initialDataFn: () => State;
    recoverFn?: DataRecoverFn<State>;
  }) {
    if (versionChain.length === 0) {
      throw new Error('DataModel requires at least one version key');
    }
    this.versionChain = versionChain;
    this.steps = steps;
    this.initialDataFn = initialDataFn;
    this.recoverFn = recoverFn;
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
    return this.versionChain[this.versionChain.length - 1];
  }

  /**
   * Number of migration steps defined.
   */
  get migrationCount(): number {
    return this.steps.length;
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
    return makeDataVersioned(this.version, this.initialDataFn());
  }

  private recoverFrom(data: unknown, version: DataVersionKey): DataMigrationResult<State> {
    try {
      return { version: this.version, data: this.recoverFn(version, data) };
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
  }

  /**
   * Migrate versioned data from any version to the latest.
   *
   * - If data is already at latest version, returns as-is
   * - If version is in chain, applies needed migrations
   * - If version is unknown, calls recover function
   * - If migration/recovery fails, returns default data with warning
   *
   * @param versioned - Data with version tag
   * @returns Migration result with data at latest version
   */
  migrate(versioned: DataVersioned<unknown>): DataMigrationResult<State> {
    const { version: fromVersion, data } = versioned;

    if (fromVersion === this.version) {
      return { version: this.version, data: data as State };
    }

    const startIndex = this.versionChain.indexOf(fromVersion);
    if (startIndex < 0) {
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

    return { version: this.version, data: currentData as State };
  }

  /**
   * Register callbacks for use in the VM.
   * Called by BlockModelV3.create() to set up internal callbacks.
   *
   * @internal
   */
  registerCallbacks(): void {
    tryRegisterCallback('__pl_data_initial', () => this.initialDataFn());
    tryRegisterCallback('__pl_data_upgrade', (versioned: DataVersioned<unknown>) =>
      this.migrate(versioned),
    );
    tryRegisterCallback('__pl_storage_initial', () => {
      const { version, data } = this.getDefaultData();
      const storage = createBlockStorage(data, version);
      return JSON.stringify(storage);
    });
  }
}
