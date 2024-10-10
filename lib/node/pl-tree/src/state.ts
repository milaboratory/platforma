import {
  BasicResourceData,
  FieldType,
  isNotNullResourceId,
  isNullResourceId,
  KeyValue,
  NullResourceId,
  OptionalResourceId,
  ResourceData,
  ResourceId,
  resourceIdToString,
  ResourceKind,
  ResourceType,
  stringifyWithResourceId
} from '@milaboratories/pl-client';
import { ChangeSource, Watcher } from '@milaboratories/computable';
import { PlTreeEntry } from './accessors';
import { ValueAndError } from './value_and_error';
import { MiLogger, notEmpty } from '@milaboratories/ts-helpers';
import { FieldTraversalStep, GetFieldStep, ResourceTraversalOps } from './traversal_ops';

export type ExtendedResourceData = ResourceData & {
  kv: KeyValue[];
};

export class TreeStateUpdateError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Interface of PlTreeResource exposed to outer world, like {@link FinalPredicate}. */
export interface PlTreeFieldI {
  readonly type: FieldType;
  readonly value: OptionalResourceId;
  readonly error: OptionalResourceId;
}

class PlTreeField {
  readonly change = new ChangeSource();

  constructor(
    public type: FieldType,
    public value: OptionalResourceId,
    public error: OptionalResourceId,
    /** Last version of resource this field was observed, used to garbage collect fields in tree patching procedure */
    public resourceVersion: number
  ) {}
}

const InitialResourceVersion = 0;

const decoder = new TextDecoder();

/** Interface of PlTreeResource exposed to outer world, like {@link FinalPredicate}. */
export type PlTreeResourceI = BasicResourceData & {
  readonly final: boolean;
  readonly fields: Map<string, PlTreeFieldI>;
};

/** Predicate of resource state used to determine if it's state is considered to be final,
 * and not expected to change in the future. */
export type FinalPredicate = (r: Omit<PlTreeResourceI, 'final'>) => boolean;

/** Never store instances of this class, always get fresh instance from {@link PlTreeState} */
export class PlTreeResource implements PlTreeResourceI {
  /** Tracks number of other resources referencing this resource. Used to perform garbage collection in tree patching procedure */
  refCount: number = 0;

  /** Increments each time resource is checked for difference with new state */
  version: number = InitialResourceVersion;
  /** Set to resource version when resource state, or it's fields have changed */
  dataVersion: number = InitialResourceVersion;

  readonly fields: Map<string, PlTreeField> = new Map();

  readonly kv = new Map<string, Uint8Array>();

  readonly resourceRemoved = new ChangeSource();

  // following change source are removed when resource is marked as final

  finalChanged? = new ChangeSource();

  resourceStateChange? = new ChangeSource();

  lockedChange? = new ChangeSource();
  inputAndServiceFieldListChanged? = new ChangeSource();
  outputFieldListChanged? = new ChangeSource();
  dynamicFieldListChanged? = new ChangeSource();

  kvChanged? = new ChangeSource();

  readonly id: ResourceId;
  originalResourceId: OptionalResourceId;

  readonly kind: ResourceKind;
  readonly type: ResourceType;

  readonly data?: Uint8Array;
  private dataAsString?: string;
  private dataAsJson?: unknown;

  error: OptionalResourceId;

  inputsLocked: boolean;
  outputsLocked: boolean;
  resourceReady: boolean;
  finalFlag: boolean;

  /** Set externally by the tree, using {@link FinalPredicate} */
  _final: boolean = false;

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
    return this._final;
  }

  public getField(
    watcher: Watcher,
    _step:
      | (Omit<GetFieldStep, 'errorIfFieldNotFound'> & { errorIfFieldNotFound: true })
      | (Omit<GetFieldStep, 'errorIfFieldNotSet'> & { errorIfFieldNotSet: true }),
    onUnstable: (marker: string) => void
  ): ValueAndError<ResourceId>;
  public getField(
    watcher: Watcher,
    _step: string | GetFieldStep,
    onUnstable: (marker: string) => void
  ): ValueAndError<ResourceId> | undefined;
  public getField(
    watcher: Watcher,
    _step: string | GetFieldStep,
    onUnstable: (marker: string) => void = () => {}
  ): ValueAndError<ResourceId> | undefined {
    const step: FieldTraversalStep = typeof _step === 'string' ? { field: _step } : _step;

    const field = this.fields.get(step.field);
    if (field === undefined) {
      if (step.errorIfFieldNotFound || step.errorIfFieldNotSet)
        throw new Error(
          `Field "${step.field}" not found in resource ${resourceIdToString(this.id)}`
        );

      if (!this.inputsLocked) this.inputAndServiceFieldListChanged?.attachWatcher(watcher);
      else if (step.assertFieldType === 'Service' || step.assertFieldType === 'Input') {
        if (step.allowPermanentAbsence)
          // stable absence of field
          return undefined;
        else throw new Error(`Service or input field not found ${step.field}.`);
      }

      if (!this.outputsLocked) this.outputFieldListChanged?.attachWatcher(watcher);
      else if (step.assertFieldType === 'Output') {
        if (step.allowPermanentAbsence)
          // stable absence of field
          return undefined;
        else throw new Error(`Output field not found ${step.field}.`);
      }

      this.dynamicFieldListChanged?.attachWatcher(watcher);
      if (!this._final && !step.stableIfNotFound) onUnstable('field_not_found:' + step.field);

      return undefined;
    } else {
      if (step.assertFieldType !== undefined && field.type !== step.assertFieldType)
        throw new Error(
          `Unexpected field type: expected ${step.assertFieldType} but got ${field.type} for the field name ${step.field}`
        );

      const ret = {} as ValueAndError<ResourceId>;
      if (isNotNullResourceId(field.value)) ret.value = field.value;
      if (isNotNullResourceId(field.error)) ret.error = field.error;
      if (ret.value === undefined && ret.error === undefined)
        // this method returns value and error of the field, thus those values are considered to be accessed;
        // any existing but not resolved field here is considered to be unstable, in the sence it is
        // considered to acquire some resolved value eventually
        onUnstable('field_not_resolved:' + step.field);
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
      this.error !== NullResourceId ||
      this.resourceReady ||
      this.originalResourceId !== NullResourceId
    );
  }

  public getIsFinal(watcher: Watcher): boolean {
    this.finalChanged?.attachWatcher(watcher);
    return this._final;
  }

  public getIsReadyOrError(watcher: Watcher): boolean {
    if (!this.isReadyOrError)
      // reverse transition can't happen, so there is no reason to wait for value to change if it is already true
      this.resourceStateChange?.attachWatcher(watcher);
    return this.isReadyOrError;
  }

  public getError(watcher: Watcher): ResourceId | undefined {
    if (isNullResourceId(this.error)) {
      this.resourceStateChange?.attachWatcher(watcher);
      return undefined;
    } else {
      // reverse transition can't happen, so there is no reason to wait for value to change, if error already set
      return this.error;
    }
  }

  public listInputFields(watcher: Watcher): string[] {
    const ret: string[] = [];
    this.fields.forEach((field, name) => {
      if (field.type === 'Input' || field.type === 'Service') ret.push(name);
    });
    if (!this.inputsLocked) this.inputAndServiceFieldListChanged?.attachWatcher(watcher);

    return ret;
  }

  public listOutputFields(watcher: Watcher): string[] {
    const ret: string[] = [];
    this.fields.forEach((field, name) => {
      if (field.type === 'Output') ret.push(name);
    });
    if (!this.outputsLocked) this.outputFieldListChanged?.attachWatcher(watcher);

    return ret;
  }

  public listDynamicFields(watcher: Watcher): string[] {
    const ret: string[] = [];
    this.fields.forEach((field, name) => {
      if (field.type !== 'Input' && field.type !== 'Output') ret.push(name);
    });
    this.dynamicFieldListChanged?.attachWatcher(watcher);

    return ret;
  }

  public getKeyValue(watcher: Watcher, key: string): Uint8Array | undefined {
    this.kvChanged?.attachWatcher(watcher);
    return this.kv.get(key);
  }

  public getKeyValueString(watcher: Watcher, key: string): string | undefined {
    const bytes = this.getKeyValue(watcher, key);
    if (bytes === undefined) return undefined;
    return decoder.decode(bytes);
  }

  public getDataAsString(): string | undefined {
    if (this.data === undefined) return undefined;
    if (this.dataAsString === undefined) this.dataAsString = decoder.decode(this.data);
    return this.dataAsString;
  }

  public getDataAsJson<T = unknown>(): T | undefined {
    if (this.data === undefined) return undefined;
    if (this.dataAsJson === undefined) this.dataAsJson = JSON.parse(this.getDataAsString()!);
    return this.dataAsJson as T;
  }

  verifyReadyState() {
    if (this.resourceReady && !this.inputsLocked)
      throw new Error(`ready without input or output lock: ${stringifyWithResourceId(this.state)}`);
  }

  get state(): BasicResourceData {
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
      final: this.finalFlag
    };
  }

  markFinal() {
    if (this._final) return;

    this._final = true;
    notEmpty(this.finalChanged).markChanged();
    this.finalChanged = undefined;
    this.resourceStateChange = undefined;
    this.dynamicFieldListChanged = undefined;
    this.inputAndServiceFieldListChanged = undefined;
    this.outputFieldListChanged = undefined;
    this.lockedChange = undefined;
  }

  /** Used for invalidation */
  markAllChanged() {
    this.fields.forEach((field) => field.change.markChanged());
    this.finalChanged?.markChanged();
    this.resourceStateChange?.markChanged();
    this.lockedChange?.markChanged();
    this.inputAndServiceFieldListChanged?.markChanged();
    this.outputFieldListChanged?.markChanged();
    this.dynamicFieldListChanged?.markChanged();
    this.kvChanged?.markChanged();
    this.resourceRemoved.markChanged();
  }
}

// TODO implement invalidate tree
// TODO make invalid state permanent
// TODO invalidate on update errors
export class PlTreeState {
  /** resource heap */
  private resources: Map<ResourceId, PlTreeResource> = new Map();
  private readonly resourcesAdded = new ChangeSource();
  /** Resets to false if any invalid state transitions are registered,
   * after that tree will produce errors for any read or write operations */
  private _isValid: boolean = true;
  private invalidationMessage?: string;

  constructor(
    /** This will be the only resource not deleted during GC round */
    public readonly root: ResourceId,
    public readonly isFinalPredicate: FinalPredicate = (r) => false
  ) {}

  public forEachResource(cb: (res: PlTreeResourceI) => void): void {
    this.resources.forEach((v) => cb(v));
  }

  private checkValid() {
    if (!this._isValid) throw new Error(this.invalidationMessage ?? 'tree is in invalid state');
  }

  public get(watcher: Watcher, rid: ResourceId): PlTreeResource {
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

  updateFromResourceData(resourceData: ExtendedResourceData[], allowOrphanInputs: boolean = false) {
    this.checkValid();

    // All resources for which recount should be incremented, first are aggregated in this list
    const incrementRefs: ResourceId[] = [];
    const decrementRefs: ResourceId[] = [];

    // patching / creating resources
    for (const rd of resourceData) {
      let resource = this.resources.get(rd.id);

      const statBeforeMutation = resource?.state;
      const unexpectedTransitionError = (reason: string): never => {
        const { fields, ...rdWithoutFields } = rd;
        this.invalidateTree();
        throw new TreeStateUpdateError(
          `Unexpected resource state transition (${reason}): ${stringifyWithResourceId(
            rdWithoutFields
          )} -> ${stringifyWithResourceId(statBeforeMutation)}`
        );
      };

      if (resource !== undefined) {
        // updating existing resource

        if (resource.final)
          unexpectedTransitionError('resource state can\t be updated after it is marked as final');

        let changed = false;
        // updating resource version, even if it was not changed
        resource.version += 1;

        // duplicate / original
        if (resource.originalResourceId !== rd.originalResourceId) {
          if (resource.originalResourceId !== NullResourceId)
            unexpectedTransitionError("originalResourceId can't change after it is set");
          resource.originalResourceId = rd.originalResourceId;
          // duplicate status of the resource counts as ready for the external observer
          notEmpty(resource.resourceStateChange).markChanged();
          changed = true;
        }

        // error
        if (resource.error !== rd.error) {
          if (isNotNullResourceId(resource.error))
            unexpectedTransitionError("resource can't change attached error after it is set");
          resource.error = rd.error;
          incrementRefs.push(resource.error as ResourceId);
          notEmpty(resource.resourceStateChange).markChanged();
          changed = true;
        }

        // updating fields
        for (const fd of rd.fields) {
          let field = resource.fields.get(fd.name);

          if (!field) {
            // new field

            field = new PlTreeField(fd.type, fd.value, fd.error, resource.version);
            if (isNotNullResourceId(fd.value)) incrementRefs.push(fd.value);
            if (isNotNullResourceId(fd.error)) incrementRefs.push(fd.error);

            if (fd.type === 'Input' || fd.type === 'Service') {
              if (resource.inputsLocked)
                unexpectedTransitionError(
                  `adding ${fd.type} (${fd.name}) field while inputs locked`
                );
              notEmpty(resource.inputAndServiceFieldListChanged).markChanged();
            } else if (fd.type === 'Output') {
              if (resource.outputsLocked)
                unexpectedTransitionError(
                  `adding ${fd.type} (${fd.name}) field while outputs locked`
                );
              notEmpty(resource.outputFieldListChanged).markChanged();
            } else {
              notEmpty(resource.dynamicFieldListChanged).markChanged();
            }

            resource.fields.set(fd.name, field);

            changed = true;
          } else {
            // change of old field

            // in principle this transition is possible, see assertions below
            if (field.type !== fd.type) {
              if (field.type !== 'Dynamic')
                unexpectedTransitionError(`field changed type ${field.type} -> ${fd.type}`);
              notEmpty(resource.dynamicFieldListChanged).markChanged();
              if (field.type === 'Input' || field.type === 'Service') {
                if (resource.inputsLocked)
                  unexpectedTransitionError(
                    `adding input field "${fd.name}", while corresponding list is locked`
                  );
                notEmpty(resource.inputAndServiceFieldListChanged).markChanged();
              }
              if (field.type === 'Output') {
                if (resource.outputsLocked)
                  unexpectedTransitionError(
                    `adding output field "${fd.name}", while corresponding list is locked`
                  );
                notEmpty(resource.outputFieldListChanged).markChanged();
              }
              field.type = fd.type;
              field.change.markChanged();
              changed = true;
            }

            // field value
            if (field.value !== fd.value) {
              if (isNotNullResourceId(field.value)) decrementRefs.push(field.value);
              field.value = fd.value;
              if (isNotNullResourceId(fd.value)) incrementRefs.push(fd.value);
              field.change.markChanged();
              changed = true;
            }

            // field error
            if (field.error !== fd.error) {
              if (isNotNullResourceId(field.error)) decrementRefs.push(field.error);
              field.error = fd.error;
              if (isNotNullResourceId(fd.error)) incrementRefs.push(fd.error);
              field.change.markChanged();
              changed = true;
            }

            field.resourceVersion = resource.version;
          }
        }

        // detecting removed fields
        resource.fields.forEach((field, fieldName, fields) => {
          if (field.resourceVersion !== resource!.version) {
            if (field.type === 'Input' || field.type === 'Service' || field.type === 'Output')
              unexpectedTransitionError(`removal of ${field.type} field ${fieldName}`);
            field.change.markChanged();
            fields.delete(fieldName);

            if (isNotNullResourceId(field.value)) decrementRefs.push(field.value);
            if (isNotNullResourceId(field.error)) decrementRefs.push(field.error);

            notEmpty(resource!.dynamicFieldListChanged).markChanged();
          }
        });

        // inputsLocked
        if (resource.inputsLocked !== rd.inputsLocked) {
          if (resource.inputsLocked) unexpectedTransitionError('inputs unlocking is not permitted');
          resource.inputsLocked = rd.inputsLocked;
          notEmpty(resource.lockedChange).markChanged();
          changed = true;
        }

        // outputsLocked
        if (resource.outputsLocked !== rd.outputsLocked) {
          if (resource.outputsLocked)
            unexpectedTransitionError('outputs unlocking is not permitted');
          resource.outputsLocked = rd.outputsLocked;
          notEmpty(resource.lockedChange).markChanged();
          changed = true;
        }

        // ready flag
        if (resource.resourceReady !== rd.resourceReady) {
          const readyStateBefore = resource.resourceReady;
          resource.resourceReady = rd.resourceReady;
          resource.verifyReadyState();
          if (!resource.isReadyOrError)
            unexpectedTransitionError(
              `resource can't lose it's ready or error state (ready state before ${readyStateBefore})`
            );
          notEmpty(resource.resourceStateChange).markChanged();
          changed = true;
        }

        // syncing kv
        let kvChanged = false;
        for (const kv of rd.kv) {
          const current = resource.kv.get(kv.key);
          if (current === undefined) {
            resource.kv.set(kv.key, kv.value);
            kvChanged = true;
          } else if (Buffer.compare(current, kv.value) !== 0) {
            resource.kv.set(kv.key, kv.value);
            kvChanged = true;
          }
        }

        if (resource.kv.size > rd.kv.length) {
          // only it this case it makes sense to check for deletions
          const newStateKeys = new Set(rd.kv.map((kv) => kv.key));

          // deleting keys not present in resource anymore
          resource.kv.forEach((value, key, map) => {
            if (!newStateKeys.has(key)) map.delete(key);
          });

          kvChanged = true;
        }

        if (kvChanged) notEmpty(resource.kvChanged).markChanged();

        if (changed) {
          // if resource was changed, updating resource data version
          resource.dataVersion = resource.version;
          if (this.isFinalPredicate(resource)) resource.markFinal();
        }
      } else {
        // creating new resource

        resource = new PlTreeResource(rd);
        resource.verifyReadyState();
        if (isNotNullResourceId(resource.error)) incrementRefs.push(resource.error);
        for (const fd of rd.fields) {
          const field = new PlTreeField(fd.type, fd.value, fd.error, InitialResourceVersion);
          if (isNotNullResourceId(fd.value)) incrementRefs.push(fd.value);
          if (isNotNullResourceId(fd.error)) incrementRefs.push(fd.error);
          resource.fields.set(fd.name, field);
        }

        // adding kv
        for (const kv of rd.kv) resource.kv.set(kv.key, kv.value);

        // checking that resource is final, and if so, marking it
        if (this.isFinalPredicate(resource)) resource.markFinal();

        // adding the resource to the heap
        this.resources.set(resource.id, resource);
        this.resourcesAdded.markChanged();
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
    let currentRefs = decrementRefs;
    while (currentRefs.length > 0) {
      const nextRefs: ResourceId[] = [];
      for (const rid of currentRefs) {
        const res = this.resources.get(rid);
        if (!res) {
          this.invalidateTree();
          throw new TreeStateUpdateError(`orphan resource ${rid}`);
        }
        res.refCount--;

        // garbage collection
        if (res.refCount === 0 && res.id !== this.root) {
          // removing fields
          res.fields.forEach((field) => {
            if (isNotNullResourceId(field.value)) nextRefs.push(field.value);
            if (isNotNullResourceId(field.error)) nextRefs.push(field.error);
            field.change.markChanged();
          });
          if (isNotNullResourceId(res.error)) nextRefs.push(res.error);
          res.resourceRemoved.markChanged();
          this.resources.delete(rid);
        }
      }
      currentRefs = nextRefs;
    }

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

  /** @deprecated use "entry" instead */
  public accessor(rid: ResourceId = this.root): PlTreeEntry {
    this.checkValid();
    return this.entry(rid);
  }

  public entry(rid: ResourceId = this.root): PlTreeEntry {
    this.checkValid();
    return new PlTreeEntry({ treeProvider: () => this }, rid);
  }

  public invalidateTree(msg?: string) {
    this._isValid = false;
    this.invalidationMessage = msg;
    this.resources.forEach((res) => {
      res.markAllChanged();
    });
  }
}
