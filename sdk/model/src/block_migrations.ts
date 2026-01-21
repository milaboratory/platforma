import { tryRegisterCallback } from './internal';
import { createBlockStorage } from './block_storage';

export type MigrationFn<From, To> = (prev: Readonly<From>) => To;

/** Versioned data wrapper for persistence */
export type Versioned<T> = {
  version: number;
  data: T;
};

/** Result of upgrade operation, may include warning if migration failed */
export type UpgradeResult<T> = Versioned<T> & {
  warning?: string;
};

/** Internal builder for chaining migrations */
class DataModelBuilder<State> {
  private readonly migrationSteps: Array<(x: unknown) => unknown>;

  private constructor(steps: Array<(x: unknown) => unknown> = []) {
    this.migrationSteps = steps;
  }

  /** Start a migration chain from an initial type */
  static from<T = unknown>(): DataModelBuilder<T> {
    return new DataModelBuilder<T>();
  }

  /** Add a migration step */
  migrate<Next>(fn: MigrationFn<State, Next>): DataModelBuilder<Next> {
    return new DataModelBuilder<Next>([...this.migrationSteps, fn as any]);
  }

  /** Finalize with initial data, creating the DataModel */
  create<S>(
    initialData: () => S,
    ..._: [State] extends [S] ? [] : [never]
  ): DataModel<S> {
    return DataModel._fromBuilder<S>(this.migrationSteps, initialData);
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
 * const dataModel = DataModel
 *   .from<V1>()
 *   .migrate((data) => ({ ...data, labels: [] }))  // v1 → v2
 *   .migrate((data) => ({ ...data, description: '' }))  // v2 → v3
 *   .create<BlockData>(() => ({ numbers: [], labels: [], description: '' }));
 */
export class DataModel<State> {
  private readonly steps: Array<(x: unknown) => unknown>;
  private readonly _initialData: () => State;

  private constructor(steps: Array<(x: unknown) => unknown>, initialData: () => State) {
    this.steps = steps;
    this._initialData = initialData;
  }

  /** Start a migration chain from an initial type */
  static from<S>(): DataModelBuilder<S> {
    return DataModelBuilder.from<S>();
  }

  /** Create a data model with just initial data (no migrations) */
  static create<S>(initialData: () => S): DataModel<S> {
    return new DataModel<S>([], initialData);
  }

  /** Create from builder (internal use) */
  static _fromBuilder<S>(
    steps: Array<(x: unknown) => unknown>,
    initialData: () => S,
  ): DataModel<S> {
    return new DataModel<S>(steps, initialData);
  }

  /**
   * Latest version number.
   * Version 1 = initial state, each migration adds 1.
   */
  get version(): number {
    return this.steps.length + 1;
  }

  /** Number of migration steps */
  get migrationCount(): number {
    return this.steps.length;
  }

  /** Get initial data */
  initialData(): State {
    return this._initialData();
  }

  /** Get default data wrapped with current version */
  getDefaultData(): Versioned<State> {
    return { version: this.version, data: this._initialData() };
  }

  /**
   * Upgrade versioned data from any version to the latest.
   * Applies only the migrations needed (skips already-applied ones).
   * If a migration fails, returns default data with a warning.
   */
  upgrade(versioned: Versioned<unknown>): UpgradeResult<State> {
    const { version: fromVersion, data } = versioned;

    if (fromVersion > this.version) {
      throw new Error(
        `Cannot downgrade from version ${fromVersion} to ${this.version}`,
      );
    }

    if (fromVersion === this.version) {
      return { version: this.version, data: data as State };
    }

    // Apply migrations starting from (fromVersion - 1) index
    // Version 1 -> no migrations applied yet -> start at index 0
    // Version 2 -> migration[0] already applied -> start at index 1
    const startIndex = fromVersion - 1;
    const migrationsToApply = this.steps.slice(startIndex);

    let currentData: unknown = data;
    for (let i = 0; i < migrationsToApply.length; i++) {
      const stepIndex = startIndex + i;
      const fromVer = stepIndex + 1;
      const toVer = stepIndex + 2;
      try {
        currentData = migrationsToApply[i](currentData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ...this.getDefaultData(),
          warning: `Migration v${fromVer}→v${toVer} failed: ${errorMessage}`,
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
   * - `__pl_data_upgrade`: upgrades versioned data from any version to latest
   * - `__pl_storage_initial`: returns initial BlockStorage as JSON string
   */
  registerCallbacks(): void {
    tryRegisterCallback('__pl_data_initial', () => this._initialData());
    tryRegisterCallback('__pl_data_upgrade', (versioned: Versioned<unknown>) => this.upgrade(versioned));
    tryRegisterCallback('__pl_storage_initial', () => {
      const { version, data } = this.getDefaultData();
      const storage = createBlockStorage(data, version);
      return JSON.stringify(storage);
    });
  }
}
