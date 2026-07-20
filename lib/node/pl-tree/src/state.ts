import type {
  BasicResourceData,
  FieldData,
  FieldStatus,
  FieldType,
  KeyValue,
  OptionalSignedResourceId,
  ResourceData,
  SignedResourceId,
  ResourceKind,
  ResourceType,
} from "@milaboratories/pl-client";
import {
  isNotNullSignedResourceId,
  isNullSignedResourceId,
  NullSignedResourceId,
  resourceIdToString,
  stringifyWithResourceId,
} from "@milaboratories/pl-client";
import type { Watcher } from "@milaboratories/computable";
import { ChangeSource, KeyedChangeSource } from "@milaboratories/computable";
import { PlTreeEntry } from "./accessors";
import type { ValueAndError } from "./value_and_error";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { cachedDecode, cachedDeserialize, notEmpty } from "@milaboratories/ts-helpers";
import type { FieldTraversalStep, GetFieldStep } from "./traversal_ops";
import type { FinalResourceDataPredicate } from "@milaboratories/pl-client";

export type ExtendedResourceData = ResourceData & {
  kv: KeyValue[];
};

export class TreeStateUpdateError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class PlTreeField implements FieldData {
  readonly change = new ChangeSource();

  constructor(
    public readonly name: string,
    public type: FieldType,
    public value: OptionalSignedResourceId,
    public error: OptionalSignedResourceId,
    public status: FieldStatus,
    public valueIsFinal: boolean,
    /** Last version of resource this field was observed, used to garbage collect fields in tree patching procedure */
    public resourceVersion: number,
  ) {}

  get state(): FieldData {
    return {
      name: this.name,
      type: this.type,
      status: this.status,
      value: this.value,
      error: this.error,
      valueIsFinal: this.valueIsFinal,
    };
  }
}

const InitialResourceVersion = 0;

export type ResourceDataWithFinalState = ResourceData & {
  finalState: boolean;
};

/** Cross-cycle re-fetch duplication counters, populated by {@link PlTreeState.updateFromResourceData}.
 * Separates genuinely new/changed resources from redundant re-fetches of unchanged ones
 * (the delta-skip opportunity: intra-cycle dedup already happens in the loader, so all waste here
 * is cross-cycle). */
export interface ResourceUpdateStat {
  /** Resources seen for the first time in this update. */
  resourcesNew: number;
  /** Resources already held whose state actually changed. */
  resourcesChanged: number;
  /** Resources already held that came back unchanged: a pure duplicate re-fetch. */
  resourcesUnchanged: number;
  /** data + KV bytes of the unchanged bucket: wasted downlink. */
  bytesUnchanged: number;
  /** Changed resources whose immutable metadata (type, kind, field set) did not change,
   * i.e. metadata re-streamed even though only a value or flag flipped. */
  metadataStableChanged: number;
  /** Per-resource fetches spent on unchanged resources (BFS only; streaming re-sends them
   * inside one stream, so this stays 0). */
  bfsRequestsWasted: number;
  /** Whether the current load used backend streaming; set by the loader, read here to
   * attribute {@link bfsRequestsWasted}. */
  usedStreaming: boolean;
}

/** Never store instances of this class, always get fresh instance from {@link PlTreeState} */
export class PlTreeResource implements ResourceDataWithFinalState {
  /** Tracks number of other resources referencing this resource. Used to perform garbage collection in tree patching procedure */
  refCount: number = 0;

  /** Increments each time resource is checked for difference with new state */
  version: number = InitialResourceVersion;
  /** Set to resource version when resource state, or it's fields have changed */
  dataVersion: number = InitialResourceVersion;

  readonly fieldsMap: Map<string, PlTreeField> = new Map();

  readonly kv = new Map<string, Uint8Array>();

  readonly resourceRemoved = new ChangeSource();

  // following change source are removed when resource is marked as final

  finalChanged? = new ChangeSource();

  resourceStateChange? = new ChangeSource();

  lockedChange? = new ChangeSource();
  inputAndServiceFieldListChanged? = new ChangeSource();
  outputFieldListChanged? = new ChangeSource();
  dynamicFieldListChanged? = new ChangeSource();

  // kvChangedGlobal? = new ChangeSource();
  kvChangedPerKey? = new KeyedChangeSource();

  readonly id: SignedResourceId;
  originalResourceId: OptionalSignedResourceId;

  readonly kind: ResourceKind;
  readonly type: ResourceType;

  readonly data?: Uint8Array;
  private dataAsString?: string;
  private dataAsJson?: unknown;

  error: OptionalSignedResourceId;

  inputsLocked: boolean;
  outputsLocked: boolean;
  resourceReady: boolean;
  finalFlag: boolean;

  /** Set externally by the tree, using {@link FinalResourceDataPredicate} */
  _finalState: boolean = false;

  private readonly logger?: MiLogger;

  constructor(initialState: BasicResourceData, logger?: MiLogger) {
    this.id = initialState.id;
    this.originalResourceId = initialState.originalResourceId;
    this.kind = initialState.kind;
    this.type = initialState.type;
    this.data = initialState.data;
    this.error = initialState.error;
    this.inputsLocked = initialState.inputsLocked;
    this.outputsLocked = initialState.outputsLocked;
    this.resourceReady = initialState.resourceReady;
    this.finalFlag = initialState.final;
    this.logger = logger;
  }

  // TODO add logging

  private info(msg: string) {
    if (this.logger !== undefined) this.logger.info(msg);
  }

  private warn(msg: string) {
    if (this.logger !== undefined) this.logger.warn(msg);
  }

  get final(): boolean {
    return this.finalFlag;
  }

  get finalState(): boolean {
    return this._finalState;
  }

  get fields(): FieldData[] {
    return [...this.fieldsMap.values()];
  }

  public getField(
    watcher: Watcher,
    _step:
      | (Omit<GetFieldStep, "errorIfFieldNotFound"> & { errorIfFieldNotFound: true })
      | (Omit<GetFieldStep, "errorIfFieldNotSet"> & { errorIfFieldNotSet: true }),
    onUnstable: (marker: string) => void,
  ): ValueAndError<SignedResourceId>;
  public getField(
    watcher: Watcher,
    _step: string | GetFieldStep,
    onUnstable: (marker: string) => void,
  ): ValueAndError<SignedResourceId> | undefined;
  public getField(
    watcher: Watcher,
    _step: string | GetFieldStep,
    onUnstable: (marker: string) => void = () => {},
  ): ValueAndError<SignedResourceId> | undefined {
    const step: FieldTraversalStep = typeof _step === "string" ? { field: _step } : _step;

    const field = this.fieldsMap.get(step.field);
    if (field === undefined) {
      if (step.errorIfFieldNotFound || step.errorIfFieldNotSet)
        throw new Error(
          `Field "${step.field}" not found in resource ${resourceIdToString(this.id)}`,
        );

      if (!this.inputsLocked) this.inputAndServiceFieldListChanged?.attachWatcher(watcher);
      else if (step.assertFieldType === "Service" || step.assertFieldType === "Input") {
        if (step.allowPermanentAbsence)
          // stable absence of field
          return undefined;
        else throw new Error(`Service or input field not found ${step.field}.`);
      }

      if (!this.outputsLocked) this.outputFieldListChanged?.attachWatcher(watcher);
      else if (step.assertFieldType === "Output") {
        if (step.allowPermanentAbsence)
          // stable absence of field
          return undefined;
        else throw new Error(`Output field not found ${step.field}.`);
      }

      this.dynamicFieldListChanged?.attachWatcher(watcher);
      if (!this._finalState && !step.stableIfNotFound) onUnstable("field_not_found:" + step.field);

      return undefined;
    } else {
      if (step.assertFieldType !== undefined && field.type !== step.assertFieldType)
        throw new Error(
          `Unexpected field type: expected ${step.assertFieldType} but got ${field.type} for the field name ${step.field}`,
        );

      const ret = {} as ValueAndError<SignedResourceId>;
      if (isNotNullSignedResourceId(field.value)) ret.value = field.value;
      if (isNotNullSignedResourceId(field.error)) ret.error = field.error;
      if (ret.value === undefined && ret.error === undefined)
        // this method returns value and error of the field, thus those values are considered to be accessed;
        // any existing but not resolved field here is considered to be unstable, in the sense it is
        // considered to acquire some resolved value eventually
        onUnstable("field_not_resolved:" + step.field);
      field.change.attachWatcher(watcher);
      return ret;
    }
  }

  public getInputsLocked(watcher: Watcher): boolean {
    if (!this.inputsLocked)
      // reverse transition can't happen, so there is no reason to wait for value to change
      this.resourceStateChange?.attachWatcher(watcher);
    return this.inputsLocked;
  }

  public getOutputsLocked(watcher: Watcher): boolean {
    if (!this.outputsLocked)
      // reverse transition can't happen, so there is no reason to wait for value to change
      this.resourceStateChange?.attachWatcher(watcher);
    return this.outputsLocked;
  }

  public get isReadyOrError(): boolean {
    return (
      this.error !== NullSignedResourceId ||
      this.resourceReady ||
      this.originalResourceId !== NullSignedResourceId
    );
  }

  public getIsFinal(watcher: Watcher): boolean {
    this.finalChanged?.attachWatcher(watcher);
    return this._finalState;
  }

  public getIsReadyOrError(watcher: Watcher): boolean {
    if (!this.isReadyOrError)
      // reverse transition can't happen, so there is no reason to wait for value to change if it is already true
      this.resourceStateChange?.attachWatcher(watcher);
    return this.isReadyOrError;
  }

  public getError(watcher: Watcher): SignedResourceId | undefined {
    if (isNullSignedResourceId(this.error)) {
      this.resourceStateChange?.attachWatcher(watcher);
      return undefined;
    } else {
      // reverse transition can't happen, so there is no reason to wait for value to change, if error already set
      return this.error;
    }
  }

  public listInputFields(watcher: Watcher): string[] {
    const ret: string[] = [];
    this.fieldsMap.forEach((field, name) => {
      if (field.type === "Input" || field.type === "Service") ret.push(name);
    });
    if (!this.inputsLocked) this.inputAndServiceFieldListChanged?.attachWatcher(watcher);

    return ret;
  }

  public listOutputFields(watcher: Watcher): string[] {
    const ret: string[] = [];
    this.fieldsMap.forEach((field, name) => {
      if (field.type === "Output") ret.push(name);
    });
    if (!this.outputsLocked) this.outputFieldListChanged?.attachWatcher(watcher);

    return ret;
  }

  public listDynamicFields(watcher: Watcher): string[] {
    const ret: string[] = [];
    this.fieldsMap.forEach((field, name) => {
      if (field.type !== "Input" && field.type !== "Output") ret.push(name);
    });
    this.dynamicFieldListChanged?.attachWatcher(watcher);

    return ret;
  }

  public getKeyValue(watcher: Watcher, key: string): Uint8Array | undefined {
    this.kvChangedPerKey?.attachWatcher(key, watcher);
    return this.kv.get(key);
  }

  public getKeyValueString(watcher: Watcher, key: string): string | undefined {
    const bytes = this.getKeyValue(watcher, key);
    if (bytes === undefined) return undefined;
    return cachedDecode(bytes);
  }

  public getKeyValueAsJson<T = unknown>(watcher: Watcher, key: string): T | undefined {
    const bytes = this.getKeyValue(watcher, key);
    if (bytes === undefined) return undefined;
    return cachedDeserialize(bytes);
  }

  public getDataAsString(): string | undefined {
    if (this.data === undefined) return undefined;
    if (this.dataAsString === undefined) this.dataAsString = cachedDecode(this.data);
    return this.dataAsString;
  }

  public getDataAsJson<T = unknown>(): T | undefined {
    if (this.data === undefined) return undefined;
    if (this.dataAsJson === undefined) this.dataAsJson = cachedDeserialize(this.data);
    return this.dataAsJson as T;
  }

  verifyReadyState() {
    if (this.resourceReady && !this.inputsLocked)
      throw new Error(
        `ready without input or output lock: ${stringifyWithResourceId(this.basicState)}`,
      );
  }

  get basicState(): BasicResourceData {
    return {
      id: this.id,
      kind: this.kind,
      type: this.type,
      data: this.data,
      resourceReady: this.resourceReady,
      inputsLocked: this.inputsLocked,
      outputsLocked: this.outputsLocked,
      error: this.error,
      originalResourceId: this.originalResourceId,
      final: this.finalFlag,
    };
  }

  get extendedState(): ExtendedResourceData {
    return {
      ...this.basicState,
      fields: this.fields,
      kv: Array.from(this.kv.entries()).map(([key, value]) => ({ key, value })),
    };
  }

  /** Called when {@link FinalResourceDataPredicate} returns true for the state. */
  markFinal() {
    if (this._finalState) return;

    this._finalState = true;
    notEmpty(this.finalChanged).markChanged("marked final");
    this.finalChanged = undefined;
    this.resourceStateChange = undefined;
    this.dynamicFieldListChanged = undefined;
    this.inputAndServiceFieldListChanged = undefined;
    this.outputFieldListChanged = undefined;
    this.lockedChange = undefined;
    // this.kvChangedGlobal = undefined;
    this.kvChangedPerKey = undefined;
  }

  /** Used for invalidation */
  markAllChanged() {
    this.fieldsMap.forEach((field) => field.change.markChanged("marked all changed"));
    this.finalChanged?.markChanged("marked all changed");
    this.resourceStateChange?.markChanged("marked all changed");
    this.lockedChange?.markChanged("marked all changed");
    this.inputAndServiceFieldListChanged?.markChanged("marked all changed");
    this.outputFieldListChanged?.markChanged("marked all changed");
    this.dynamicFieldListChanged?.markChanged("marked all changed");
    // this.kvChangedGlobal?.markChanged('marked all changed');
    this.kvChangedPerKey?.markAllChanged("marked all changed");
    this.resourceRemoved.markChanged("marked all changed");
  }
}

export class PlTreeState {
  /** resource heap */
  private resources: Map<SignedResourceId, PlTreeResource> = new Map();
  private readonly resourcesAdded = new ChangeSource();
  /** Marked when the root set changes (roots discovered or removed), so multi-root
   * accessors that read the set recompute. */
  private readonly rootsChanged = new ChangeSource();
  /** Resets to false if any invalid state transitions are registered,
   * after that tree will produce errors for any read or write operations */
  private _isValid: boolean = true;
  private invalidationMessage?: string;

  /** The set of roots — resources protected from GC. Originally a single `root`,
   * generalized to a set so several explicit roots and dynamically-discovered shared
   * roots can coexist in one heap. Mutated through {@link setRoots}. */
  public readonly roots: Set<SignedResourceId>;

  constructor(
    /** Resources protected from GC. Accepts a single id (single-root, the original
     * contract) or a set of ids (multi-root). */
    roots: SignedResourceId | Set<SignedResourceId>,
    public readonly isFinalPredicate: FinalResourceDataPredicate,
  ) {
    this.roots = roots instanceof Set ? new Set(roots) : new Set([roots]);
  }

  /** Backward-compatible single-root accessor. Returns the sole root and THROWS if the
   * tree has zero or more than one root, so a multi-root tree can never be read as if it
   * had one. Mirrors the {@link entry} guard. */
  public get root(): SignedResourceId {
    if (this.roots.size !== 1)
      throw new Error(
        `single-root accessor used on a tree with ${this.roots.size} roots; use the multi-root API`,
      );
    return this.roots.values().next().value!;
  }

  public forEachResource(cb: (res: ResourceDataWithFinalState) => void): void {
    this.resources.forEach((v) => cb(v));
  }

  private checkValid() {
    if (!this._isValid) throw new Error(this.invalidationMessage ?? "tree is in invalid state");
  }

  /** Reactive read of the current root set. Attaches the watcher to {@link rootsChanged}
   * so a Computable recomputes when discovered roots appear or disappear. */
  public getRoots(watcher: Watcher): SignedResourceId[] {
    this.checkValid();
    this.rootsChanged.attachWatcher(watcher);
    return [...this.roots];
  }

  public get(watcher: Watcher, rid: SignedResourceId): PlTreeResource {
    this.checkValid();
    const res = this.resources.get(rid);
    if (res === undefined) {
      // to make recovery from resource not found possible, considering some
      // race conditions, where computable is created before tree is updated
      this.resourcesAdded.attachWatcher(watcher);
      throw new Error(`resource ${resourceIdToString(rid)} not found in the tree`);
    }
    res.resourceRemoved.attachWatcher(watcher);
    return res;
  }

  updateFromResourceData(
    resourceData: ExtendedResourceData[],
    allowOrphanInputs: boolean = false,
    stat?: ResourceUpdateStat,
  ) {
    this.checkValid();

    // All resources for which recount should be incremented, first are aggregated in this list
    const incrementRefs: SignedResourceId[] = [];
    const decrementRefs: SignedResourceId[] = [];

    // patching / creating resources
    for (const rd of resourceData) {
      let resource = this.resources.get(rd.id);
      const held = resource !== undefined;
      let changed = false;
      // Structural/metadata change (new or removed field). type and kind are readonly, so
      // they never change; this flag isolates value/flag-only changes from real metadata churn.
      let metadataChanged = false;

      const statBeforeMutation = resource?.basicState;
      const unexpectedTransitionError = (reason: string): never => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { fields, ...rdWithoutFields } = rd;
        this.invalidateTree();
        throw new TreeStateUpdateError(
          `Unexpected resource state transition (${reason}): ${stringifyWithResourceId(
            rdWithoutFields,
          )} -> ${stringifyWithResourceId(statBeforeMutation)}`,
        );
      };

      if (resource !== undefined) {
        // updating existing resource

        if (resource.finalState)
          unexpectedTransitionError("resource state can\t be updated after it is marked as final");

        // updating resource version, even if it was not changed
        resource.version += 1;

        // duplicate / original
        if (resource.originalResourceId !== rd.originalResourceId) {
          if (resource.originalResourceId !== NullSignedResourceId)
            unexpectedTransitionError("originalResourceId can't change after it is set");
          resource.originalResourceId = rd.originalResourceId;
          // duplicate status of the resource counts as ready for the external observer
          notEmpty(resource.resourceStateChange).markChanged(
            `originalResourceId changed for ${resourceIdToString(resource.id)}`,
          );
          changed = true;
        }

        // error
        if (isNotNullSignedResourceId(rd.error) && resource.error !== rd.error) {
          if (isNotNullSignedResourceId(resource.error))
            unexpectedTransitionError("resource can't change attached error after it is set");
          resource.error = rd.error;
          incrementRefs.push(resource.error);
          notEmpty(resource.resourceStateChange).markChanged(
            `error changed for ${resourceIdToString(resource.id)}`,
          );
          changed = true;
        }

        // updating fields
        for (const fd of rd.fields) {
          let field = resource.fieldsMap.get(fd.name);

          if (!field) {
            // new field

            field = new PlTreeField(
              fd.name,
              fd.type,
              fd.value,
              fd.error,
              fd.status,
              fd.valueIsFinal,
              resource.version,
            );
            if (isNotNullSignedResourceId(fd.value)) incrementRefs.push(fd.value);
            if (isNotNullSignedResourceId(fd.error)) incrementRefs.push(fd.error);

            if (fd.type === "Input" || fd.type === "Service") {
              if (resource.inputsLocked)
                unexpectedTransitionError(
                  `adding ${fd.type} (${fd.name}) field while inputs locked`,
                );
              notEmpty(resource.inputAndServiceFieldListChanged).markChanged(
                `new ${fd.type} field ${fd.name} added to ${resourceIdToString(resource.id)}`,
              );
            } else if (fd.type === "Output") {
              if (resource.outputsLocked)
                unexpectedTransitionError(
                  `adding ${fd.type} (${fd.name}) field while outputs locked`,
                );
              notEmpty(resource.outputFieldListChanged).markChanged(
                `new ${fd.type} field ${fd.name} added to ${resourceIdToString(resource.id)}`,
              );
            } else {
              notEmpty(resource.dynamicFieldListChanged).markChanged(
                `new ${fd.type} field ${fd.name} added to ${resourceIdToString(resource.id)}`,
              );
            }

            resource.fieldsMap.set(fd.name, field);

            changed = true;
            metadataChanged = true;
          } else {
            // change of old field

            // in principle this transition is possible, see assertions below
            if (field.type !== fd.type) {
              if (field.type !== "Dynamic")
                unexpectedTransitionError(`field changed type ${field.type} -> ${fd.type}`);
              notEmpty(resource.dynamicFieldListChanged).markChanged(
                `field ${fd.name} changed type from Dynamic to ${fd.type} in ${resourceIdToString(resource.id)}`,
              );
              if (field.type === "Input" || field.type === "Service") {
                if (resource.inputsLocked)
                  unexpectedTransitionError(
                    `adding input field "${fd.name}", while corresponding list is locked`,
                  );
                notEmpty(resource.inputAndServiceFieldListChanged).markChanged(
                  `field ${fd.name} changed to type ${fd.type} in ${resourceIdToString(resource.id)}`,
                );
              }
              if (field.type === "Output") {
                if (resource.outputsLocked)
                  unexpectedTransitionError(
                    `adding output field "${fd.name}", while corresponding list is locked`,
                  );
                notEmpty(resource.outputFieldListChanged).markChanged(
                  `field ${fd.name} changed to type ${fd.type} in ${resourceIdToString(resource.id)}`,
                );
              }
              field.type = fd.type;
              field.change.markChanged(
                `field ${fd.name} type changed to ${fd.type} in ${resourceIdToString(resource.id)}`,
              );
              changed = true;
            }

            // field value
            if (field.value !== fd.value) {
              if (isNotNullSignedResourceId(field.value)) decrementRefs.push(field.value);
              field.value = fd.value;
              if (isNotNullSignedResourceId(fd.value)) incrementRefs.push(fd.value);
              field.change.markChanged(
                `field ${fd.name} value changed in ${resourceIdToString(resource.id)}`,
              );
              changed = true;
            }

            // field error
            if (field.error !== fd.error) {
              if (isNotNullSignedResourceId(field.error)) decrementRefs.push(field.error);
              field.error = fd.error;
              if (isNotNullSignedResourceId(fd.error)) incrementRefs.push(fd.error);
              field.change.markChanged(
                `field ${fd.name} error changed in ${resourceIdToString(resource.id)}`,
              );
              changed = true;
            }

            // field status
            if (field.status !== fd.status) {
              field.status = fd.status;
              field.change.markChanged(
                `field ${fd.name} status changed to ${fd.status} in ${resourceIdToString(resource.id)}`,
              );
              changed = true;
            }

            // field valueIsFinal flag
            if (field.valueIsFinal !== fd.valueIsFinal) {
              field.valueIsFinal = fd.valueIsFinal;
              field.change.markChanged(
                `field ${fd.name} valueIsFinal changed to ${fd.valueIsFinal} in ${resourceIdToString(resource.id)}`,
              );
              changed = true;
            }

            field.resourceVersion = resource.version;
          }
        }

        // detecting removed fields
        resource.fieldsMap.forEach((field, fieldName, fields) => {
          if (field.resourceVersion !== resource!.version) {
            if (field.type === "Input" || field.type === "Service" || field.type === "Output")
              unexpectedTransitionError(`removal of ${field.type} field ${fieldName}`);
            field.change.markChanged(
              `dynamic field ${fieldName} removed from ${resourceIdToString(resource!.id)}`,
            );
            fields.delete(fieldName);
            metadataChanged = true;

            if (isNotNullSignedResourceId(field.value)) decrementRefs.push(field.value);
            if (isNotNullSignedResourceId(field.error)) decrementRefs.push(field.error);

            notEmpty(resource!.dynamicFieldListChanged).markChanged(
              `dynamic field ${fieldName} removed from ${resourceIdToString(resource!.id)}`,
            );
          }
        });

        // inputsLocked
        if (resource.inputsLocked !== rd.inputsLocked) {
          if (resource.inputsLocked) unexpectedTransitionError("inputs unlocking is not permitted");
          resource.inputsLocked = rd.inputsLocked;
          notEmpty(resource.lockedChange).markChanged(
            `inputs locked for ${resourceIdToString(resource.id)}`,
          );
          changed = true;
        }

        // outputsLocked
        if (resource.outputsLocked !== rd.outputsLocked) {
          if (resource.outputsLocked)
            unexpectedTransitionError("outputs unlocking is not permitted");
          resource.outputsLocked = rd.outputsLocked;
          notEmpty(resource.lockedChange).markChanged(
            `outputs locked for ${resourceIdToString(resource.id)}`,
          );
          changed = true;
        }

        // ready flag
        if (resource.resourceReady !== rd.resourceReady) {
          const readyStateBefore = resource.resourceReady;
          resource.resourceReady = rd.resourceReady;
          resource.verifyReadyState();
          if (!resource.isReadyOrError)
            unexpectedTransitionError(
              `resource can't lose it's ready or error state (ready state before ${readyStateBefore})`,
            );
          notEmpty(resource.resourceStateChange).markChanged(
            `ready flag changed to ${rd.resourceReady} for ${resourceIdToString(resource.id)}`,
          );
          changed = true;
        }

        // syncing kv
        for (const kv of rd.kv) {
          const current = resource.kv.get(kv.key);
          if (current === undefined) {
            resource.kv.set(kv.key, kv.value);
            notEmpty(resource.kvChangedPerKey).markChanged(
              kv.key,
              `kv added for ${resourceIdToString(resource.id)}: ${kv.key}`,
            );
          } else if (Buffer.compare(current, kv.value) !== 0) {
            resource.kv.set(kv.key, kv.value);
            notEmpty(resource.kvChangedPerKey).markChanged(
              kv.key,
              `kv changed for ${resourceIdToString(resource.id)}: ${kv.key}`,
            );
          }
        }

        if (resource.kv.size > rd.kv.length) {
          // only it this case it makes sense to check for deletions
          const newStateKeys = new Set(rd.kv.map((kv) => kv.key));

          // deleting keys not present in resource anymore
          resource.kv.forEach((_value, key, map) => {
            if (!newStateKeys.has(key)) {
              map.delete(key);
              notEmpty(resource!.kvChangedPerKey).markChanged(
                key,
                `kv deleted for ${resourceIdToString(resource!.id)}: ${key}`,
              );
            }
          });
        }

        if (changed) {
          // if resource was changed, updating resource data version
          resource.dataVersion = resource.version;
          if (this.isFinalPredicate(resource)) resource.markFinal();
        }
      } else {
        // creating new resource

        resource = new PlTreeResource(rd);
        resource.verifyReadyState();
        if (isNotNullSignedResourceId(resource.error)) incrementRefs.push(resource.error);
        for (const fd of rd.fields) {
          const field = new PlTreeField(
            fd.name,
            fd.type,
            fd.value,
            fd.error,
            fd.status,
            fd.valueIsFinal,
            InitialResourceVersion,
          );
          if (isNotNullSignedResourceId(fd.value)) incrementRefs.push(fd.value);
          if (isNotNullSignedResourceId(fd.error)) incrementRefs.push(fd.error);
          resource.fieldsMap.set(fd.name, field);
        }

        // adding kv
        for (const kv of rd.kv) resource.kv.set(kv.key, kv.value);

        // checking that resource is final, and if so, marking it
        if (this.isFinalPredicate(resource)) resource.markFinal();

        // adding the resource to the heap
        this.resources.set(resource.id, resource);
        this.resourcesAdded.markChanged(`new resource ${resourceIdToString(resource.id)} added`);
      }

      if (stat) {
        if (!held) stat.resourcesNew++;
        else if (changed) {
          stat.resourcesChanged++;
          if (!metadataChanged) stat.metadataStableChanged++;
        } else {
          stat.resourcesUnchanged++;
          stat.bytesUnchanged += rd.data?.length ?? 0;
          for (const kv of rd.kv) stat.bytesUnchanged += kv.value.length;
          if (!stat.usedStreaming) stat.bfsRequestsWasted++;
        }
      }
    }

    // applying refCount increments
    for (const rid of incrementRefs) {
      const res = this.resources.get(rid);
      if (!res) {
        this.invalidateTree();
        throw new TreeStateUpdateError(`orphan resource ${rid}`);
      }
      res.refCount++;
    }

    // recursively applying refCount decrements / doing garbage collection
    this.collectGarbage(decrementRefs);

    // checking for orphans (maybe removed in the future)
    if (!allowOrphanInputs) {
      for (const rd of resourceData) {
        if (!this.resources.has(rd.id)) {
          this.invalidateTree();
          throw new TreeStateUpdateError(`orphan input resource ${rd.id}`);
        }
      }
    }
  }

  /** Runs the refcount-decrement garbage-collection cascade over the given worklist.
   * A resource reaching refCount 0 that is not a root is removed, and its outgoing
   * references are decremented in turn, until the worklist drains. Factored out of
   * {@link updateFromResourceData} so {@link setRoots} can reuse the same cascade. */
  private collectGarbage(decrementRefs: SignedResourceId[]) {
    let currentRefs = decrementRefs;
    while (currentRefs.length > 0) {
      const nextRefs: SignedResourceId[] = [];
      for (const rid of currentRefs) {
        const res = this.resources.get(rid);
        if (!res) {
          this.invalidateTree();
          throw new TreeStateUpdateError(`orphan resource ${rid}`);
        }
        res.refCount--;

        // garbage collection
        if (res.refCount === 0 && !this.roots.has(res.id)) {
          // removing fields
          res.fieldsMap.forEach((field) => {
            if (isNotNullSignedResourceId(field.value)) nextRefs.push(field.value);
            if (isNotNullSignedResourceId(field.error)) nextRefs.push(field.error);
            field.change.markChanged(
              `field ${field.name} removed during garbage collection of ${resourceIdToString(res.id)}`,
            );
          });
          if (isNotNullSignedResourceId(res.error)) nextRefs.push(res.error);
          res.resourceRemoved.markChanged(
            `resource removed during garbage collection: ${resourceIdToString(res.id)}`,
          );
          this.resources.delete(rid);
        }
      }
      currentRefs = nextRefs;
    }
  }

  /** Replaces the current root set with `newRoots`.
   *
   * Roots that leave the set lose their GC protection: each removed root present in the
   * heap is collected directly (a root sits at refCount 0, so it is never enqueued by an
   * ordinary decrement), and its subtree cascades to collection through the existing
   * refcount GC — the standard removal mechanic, applied to a root. Roots newly added to
   * the set are protected immediately; their resources arrive on the next refresh poll. */
  public setRoots(newRoots: Set<SignedResourceId>) {
    this.checkValid();

    const removed: SignedResourceId[] = [];
    for (const rid of this.roots) if (!newRoots.has(rid)) removed.push(rid);
    let added = false;
    for (const rid of newRoots) if (!this.roots.has(rid)) added = true;
    if (removed.length === 0 && !added) return; // no change

    // commit the new protected set before collecting, so a removed root is no longer
    // protected while its subtree cascades.
    this.roots.clear();
    for (const rid of newRoots) this.roots.add(rid);

    this.rootsChanged.markChanged("root set changed");

    for (const rid of removed) {
      const res = this.resources.get(rid);
      if (res === undefined) continue; // root not yet materialized in the heap

      // if the (former) root is still referenced by another resource, dropping protection
      // is enough — ordinary refcounting keeps it alive and will collect it later.
      if (res.refCount > 0) continue;

      // collect the (now-unprotected) root itself and seed the cascade with the refs it holds
      const seed: SignedResourceId[] = [];
      res.fieldsMap.forEach((field) => {
        if (isNotNullSignedResourceId(field.value)) seed.push(field.value);
        if (isNotNullSignedResourceId(field.error)) seed.push(field.error);
        field.change.markChanged(
          `field ${field.name} removed after root ${resourceIdToString(res.id)} left the root set`,
        );
      });
      if (isNotNullSignedResourceId(res.error)) seed.push(res.error);
      res.resourceRemoved.markChanged(
        `resource removed after leaving the root set: ${resourceIdToString(res.id)}`,
      );
      this.resources.delete(rid);

      this.collectGarbage(seed);
    }
  }

  /** @deprecated use "entry" instead */
  public accessor(rid: SignedResourceId = this.root): PlTreeEntry {
    this.checkValid();
    return this.entry(rid);
  }

  public entry(rid: SignedResourceId = this.root): PlTreeEntry {
    this.checkValid();
    return new PlTreeEntry({ treeProvider: () => this }, rid);
  }

  public invalidateTree(msg?: string) {
    this._isValid = false;
    this.invalidationMessage = msg;
    this.rootsChanged.markChanged("tree invalidated");
    this.resources.forEach((res) => {
      res.markAllChanged();
    });
  }

  public dumpState(): ExtendedResourceData[] {
    return Array.from(this.resources.values()).map((res) => res.extendedState);
  }
}
