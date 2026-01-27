import { tryRegisterCallback } from './internal';
import { createBlockStorage, DATA_MODEL_DEFAULT_VERSION } from './block_storage';

export type DataVersionKey = string;
export type DataVersionMap = Record<string, unknown>;
export type DataMigrateFn<From, To> = (prev: Readonly<From>) => To;
export type DataCreateFn<T> = () => T;
export type DataRecoverFn<T> = (version: DataVersionKey, data: unknown) => T;

/**
 * Helper to define version keys with literal type inference and runtime validation.
 * - Validates that all version values are unique
 * - Eliminates need for `as const` assertion
 *
 * @throws Error if duplicate version values are found
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
  const values = Object.values(versions);
  const emptyKeys = Object.keys(versions).filter((key) => versions[key] === '');
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

/** Default recover function for unknown versions */
export const defaultRecover: DataRecoverFn<never> = (version, _data) => {
  throw new DataUnrecoverableError(version);
};

/** Internal builder for chaining migrations */
class DataModelBuilder<
  VersionedData extends DataVersionMap,
  CurrentVersion extends keyof VersionedData & string,
> {
  private readonly versionChain: DataVersionKey[];
  private readonly migrationSteps: MigrationStep[];
  private readonly recoverFn?: DataRecoverFn<VersionedData[CurrentVersion]>;

  private constructor(
    versionChain: DataVersionKey[],
    steps: MigrationStep[] = [],
    recoverFn?: DataRecoverFn<VersionedData[CurrentVersion]>,
  ) {
    this.versionChain = versionChain;
    this.migrationSteps = steps;
    this.recoverFn = recoverFn;
  }

  /** Start a migration chain from an initial version */
  static from<
    VersionedData extends DataVersionMap,
    InitialVersion extends keyof VersionedData & string = keyof VersionedData & string,
  >(initialVersion: InitialVersion): DataModelBuilder<VersionedData, InitialVersion> {
    return new DataModelBuilder<VersionedData, InitialVersion>([initialVersion]);
  }

  /** Add a migration step to the target version */
  migrate<NextVersion extends keyof VersionedData & string>(
    nextVersion: NextVersion,
    fn: DataMigrateFn<VersionedData[CurrentVersion], VersionedData[NextVersion]>,
  ): DataModelBuilder<VersionedData, NextVersion> {
    if (this.versionChain.includes(nextVersion)) {
      throw new Error(`Duplicate version '${nextVersion}' in migration chain`);
    }
    const fromVersion = this.versionChain[this.versionChain.length - 1];
    const step: MigrationStep = { fromVersion, toVersion: nextVersion, migrate: fn as (data: unknown) => unknown };
    return new DataModelBuilder<VersionedData, NextVersion>(
      [...this.versionChain, nextVersion],
      [...this.migrationSteps, step],
    );
  }

  /** Set recovery handler for unknown or unsupported versions */
  recover(
    fn: DataRecoverFn<VersionedData[CurrentVersion]>,
  ): DataModelBuilder<VersionedData, CurrentVersion> {
    return new DataModelBuilder<VersionedData, CurrentVersion>(
      [...this.versionChain],
      [...this.migrationSteps],
      fn,
    );
  }

  /** Finalize with initial data, creating the DataModel */
  create<S extends VersionedData[CurrentVersion]>(
    initialData: DataCreateFn<S>,
    ..._: [VersionedData[CurrentVersion]] extends [S] ? [] : [never]
  ): DataModel<S> {
    return DataModel._fromBuilder<S>(
      this.versionChain,
      this.migrationSteps,
      initialData,
      this.recoverFn as DataRecoverFn<S> | undefined,
    );
  }
}

/**
 * DataModel defines the block's data structure, initial values, and migrations.
 * Used by BlockModelV3 to manage data state.
 *
 * @example
 * // Simple data model (no migrations)
 * const dataModel = DataModel.create<BlockData>(() => ({
 *   numbers: [],
 *   labels: [],
 * }));
 *
 * // Data model with migrations
 * const Version = defineDataVersions({
 *   V1: 'v1',
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
 * const dataModel = DataModel
 *   .from<VersionedData>(Version.V1)
 *   .migrate(Version.V2, (data) => ({ ...data, labels: [] }))
 *   .migrate(Version.V3, (data) => ({ ...data, description: '' }))
 *   .recover((version, data) => {
 *     if (version === 'legacy' && typeof data === 'object' && data !== null && 'numbers' in data) {
 *       return { numbers: (data as { numbers: number[] }).numbers, labels: [], description: '' };
 *     }
 *     return defaultRecover(version, data);
 *   })
 *   .create(() => ({ numbers: [], labels: [], description: '' }));
 */
export class DataModel<State> {
  private readonly versionChain: DataVersionKey[];
  private readonly steps: MigrationStep[];
  private readonly initialDataFn: () => State;
  private readonly recoverFn: DataRecoverFn<State>;

  private constructor(
    versionChain: DataVersionKey[],
    steps: MigrationStep[],
    initialData: () => State,
    recover: DataRecoverFn<State> = defaultRecover as DataRecoverFn<State>,
  ) {
    if (versionChain.length === 0) {
      throw new Error('DataModel requires at least one version key');
    }
    this.versionChain = versionChain;
    this.steps = steps;
    this.initialDataFn = initialData;
    this.recoverFn = recover;
  }

  /** Start a migration chain from an initial type */
  static from<
    VersionedData extends DataVersionMap,
    InitialVersion extends keyof VersionedData & string = keyof VersionedData & string,
  >(initialVersion: InitialVersion): DataModelBuilder<VersionedData, InitialVersion> {
    return DataModelBuilder.from<VersionedData, InitialVersion>(initialVersion);
  }

  /** Create a data model with just initial data (no migrations) */
  static create<S>(initialData: () => S, version: DataVersionKey = DATA_MODEL_DEFAULT_VERSION): DataModel<S> {
    return new DataModel<S>([version], [], initialData);
  }

  /** Create from builder (internal use) */
  static _fromBuilder<S>(
    versionChain: DataVersionKey[],
    steps: MigrationStep[],
    initialData: () => S,
    recover?: DataRecoverFn<S>,
  ): DataModel<S> {
    return new DataModel<S>(versionChain, steps, initialData, recover);
  }

  /**
   * Latest version key.
   */
  get version(): DataVersionKey {
    return this.versionChain[this.versionChain.length - 1];
  }

  /** Number of migration steps */
  get migrationCount(): number {
    return this.steps.length;
  }

  /** Get initial data */
  initialData(): State {
    return this.initialDataFn();
  }

  /** Get default data wrapped with current version */
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
   * Applies only the migrations needed (skips already-applied ones).
   * If a migration fails, returns default data with a warning.
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
   * All callbacks are prefixed with `__pl_` to indicate internal SDK use:
   * - `__pl_data_initial`: returns initial data for new blocks
   * - `__pl_data_migrate`: migrates versioned data from any version to latest
   * - `__pl_storage_initial`: returns initial BlockStorage as JSON string
   */
  registerCallbacks(): void {
    tryRegisterCallback('__pl_data_initial', () => this.initialDataFn());
    tryRegisterCallback('__pl_data_migrate', (versioned: DataVersioned<unknown>) => this.migrate(versioned));
    tryRegisterCallback('__pl_storage_initial', () => {
      const { version, data } = this.getDefaultData();
      const storage = createBlockStorage(data, version);
      return JSON.stringify(storage);
    });
  }
}
