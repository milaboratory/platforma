import { PlTreeResource, PlTreeState } from './state';
import {
  ComputableCtx, ComputableHooks,
  TrackedAccessorProvider,
  UsageGuard,
  Watcher
} from '@milaboratory/computable';
import {
  ResourceId,
  resourceIdToString,
  ResourceType, resourceTypesEqual,
  resourceTypeToString
} from '@milaboratory/pl-client-v2';
import { mapValueAndError, ValueAndError } from './value_and_error';
import { CommonFieldTraverseOps, FieldTraversalStep, GetFieldStep, ResourceTraversalOps } from './traversal_ops';

/** Error encountered during traversal in field or resource. */
export class PlError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type TreeAccessorData = {
  readonly treeProvider: () => PlTreeState,
  readonly hooks?: ComputableHooks
}

export type TreeAccessorInstanceData = {
  readonly watcher: Watcher,
  readonly guard: UsageGuard,
  readonly ctx: ComputableCtx
}

/** Main entry point for using PlTree in reactive setting */
export class PlTreeEntry implements TrackedAccessorProvider<PlTreeEntryAccessor> {
  constructor(
    private readonly accessorData: TreeAccessorData,
    public readonly rid: ResourceId
  ) {
  }

  createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): PlTreeEntryAccessor {
    return new PlTreeEntryAccessor(this.accessorData,
      this.accessorData.treeProvider(), this.rid,
      { ctx, watcher, guard });
  }
}

function getResourceFromTree(accessorData: TreeAccessorData,
                             tree: PlTreeState, instanceData: TreeAccessorInstanceData,
                             rid: ResourceId, ops: ResourceTraversalOps): PlTreeNodeAccessor {
  const acc = new PlTreeNodeAccessor(accessorData, tree, tree.get(instanceData.watcher, rid), instanceData);

  if (!ops.ignoreError) {
    const err = acc.getError();
    if (err !== undefined)
      throw new PlError(`error encountered on resource ${resourceIdToString(acc.id)} (${resourceTypeToString(acc.resourceType)}): ${err.getDataAsString()}`);
  }

  if (ops.assertResourceType !== undefined &&
    (Array.isArray(ops.assertResourceType)
      ? ops.assertResourceType.findIndex(rt => resourceTypesEqual(rt, acc.resourceType)) === -1
      : !resourceTypesEqual(ops.assertResourceType, acc.resourceType)))
    throw new Error(`wrong resource type ${resourceTypeToString(acc.resourceType)} but expected ${ops.assertResourceType}`);

  return acc;
}

export class PlTreeEntryAccessor {
  constructor(
    private readonly accessorData: TreeAccessorData,
    private readonly tree: PlTreeState,
    private readonly rid: ResourceId,
    private readonly instanceData: TreeAccessorInstanceData
  ) {
  }

  node(ops: ResourceTraversalOps = {}): PlTreeNodeAccessor {
    this.instanceData.guard();

    // this is the only entry point to acquire a PlTreeNodeAccessor,
    // so this is the only point where we should attach the hooks
    if (this.accessorData.hooks !== undefined)
      this.instanceData.ctx.attacheHooks(this.accessorData.hooks);

    return getResourceFromTree(this.accessorData, this.tree,
      this.instanceData, this.rid, ops);
  }
}

/**
 * API contracts:
 *   - API never return {@link NullResourceId}, absence of link is always modeled as `undefined`
 *
 * Important: never store instances of this class, always get fresh instance from {@link PlTreeState} accessor.
 * */
export class PlTreeNodeAccessor {
  constructor(
    private readonly accessorData: TreeAccessorData,
    private readonly tree: PlTreeState,
    private readonly resource: PlTreeResource,
    private readonly instanceData: TreeAccessorInstanceData
  ) {
  }

  public get id() {
    return this.resource.id;
  }

  private getResourceFromTree(rid: ResourceId, ops: ResourceTraversalOps): PlTreeNodeAccessor {
    return getResourceFromTree(this.accessorData, this.tree, this.instanceData,
      rid, ops);
  }

  public get resourceType(): ResourceType {
    return this.resource.type;
  }

  public traverse(...steps: [Omit<FieldTraversalStep, 'errorIfFieldNotAssigned'> & {
    errorIfFieldNotAssigned: true
  }]): PlTreeNodeAccessor
  public traverse(...steps: (FieldTraversalStep | string)[]): PlTreeNodeAccessor | undefined
  public traverse(...steps: (FieldTraversalStep | string)[]): PlTreeNodeAccessor | undefined {
    return this.traverseWithCommon({}, ...steps);
  }

  public traverseWithCommon(commonOptions: CommonFieldTraverseOps, ...steps: (FieldTraversalStep | string)[]): PlTreeNodeAccessor | undefined {
    let current: PlTreeNodeAccessor = this;

    for (const _step of steps) {
      const step: FieldTraversalStep =
        typeof _step === 'string'
          ? {
            ...commonOptions,
            field: _step
          }
          : { ...commonOptions, ..._step };

      const next = current.getField(_step);

      if (next === undefined)
        return undefined;

      if (!step.ignoreError && next.error !== undefined)
        throw new PlError(`error in field ${step.field} of ${resourceIdToString(current.id)}: ${next.error.getDataAsString()}`);

      if (next.value === undefined) {
        if (step.errorIfFieldNotAssigned)
          throw new PlError(`field have no assigned value ${step.field} of ${resourceIdToString(current.id)}`);
        return undefined;
      }

      current = next.value;
    }
    return current;
  }

  private readonly onUnstableLambda = () => this.instanceData.ctx.markUnstable();

  public getField(_step:
                    | Omit<GetFieldStep, 'errorIfFieldNotFound'> & { errorIfFieldNotFound: true }
                    | Omit<GetFieldStep, 'errorIfFieldNotAssigned'> & { errorIfFieldNotAssigned: true }
  ): ValueAndError<PlTreeNodeAccessor>
  public getField(_step: GetFieldStep | string): ValueAndError<PlTreeNodeAccessor> | undefined
  public getField(_step: GetFieldStep | string): ValueAndError<PlTreeNodeAccessor> | undefined {
    this.instanceData.guard();
    const step: GetFieldStep = typeof _step === 'string' ? { field: _step } : _step;

    const ve = this.resource.getField(
      this.instanceData.watcher, step, this.onUnstableLambda);

    if (ve === undefined) return undefined;

    return mapValueAndError(ve, (rid) =>
      this.getResourceFromTree(rid, { ignoreError: true }));
  }

  public getInputsLocked(): boolean {
    this.instanceData.guard();
    const result = this.resource.getInputsLocked(this.instanceData.watcher);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  public getOutputsLocked(): boolean {
    this.instanceData.guard();
    const result = this.resource.getOutputsLocked(this.instanceData.watcher);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  public getIsReadyOrError(): boolean {
    this.instanceData.guard();
    const result = this.resource.getIsReadyOrError(this.instanceData.watcher);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  public getIsFinal() {
    this.instanceData.guard();
    return this.resource.getIsFinal(this.instanceData.watcher);
  }

  public getError(): PlTreeNodeAccessor | undefined {
    this.instanceData.guard();
    const rid = this.resource.getError(this.instanceData.watcher);
    if (rid === undefined)
      // absence of error always considered as stable
      return undefined;
    return this.getResourceFromTree(rid, {});
  }

  public getData(): Uint8Array | undefined {
    return this.resource.data;
  }

  public getDataAsString(): string | undefined {
    return this.resource.getDataAsString();
  }

  public getDataAsJson<T = unknown>(): T | undefined {
    return this.resource.getDataAsJson<T>();
  }

  public listInputFields(): string[] {
    this.instanceData.guard();
    return this.resource.listInputFields(this.instanceData.watcher);
  }

  public listOutputFields(): string[] {
    this.instanceData.guard();
    return this.resource.listOutputFields(this.instanceData.watcher);
  }

  public listDynamicFields(): string[] {
    this.instanceData.guard();
    return this.resource.listDynamicFields(this.instanceData.watcher);
  }

  public getKeyValue(key: string, unstableIfNotFound: boolean = false): Uint8Array | undefined {
    this.instanceData.guard();
    const result = this.resource.getKeyValue(this.instanceData.watcher, key);
    if (result === undefined && unstableIfNotFound)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  /** @deprecated */
  public getKeyValueString(key: string): string | undefined {
    return this.getKeyValueAsString(key);
  }

  public getKeyValueAsString(key: string, unstableIfNotFound: boolean = false): string | undefined {
    this.instanceData.guard();
    const result = this.resource.getKeyValueString(this.instanceData.watcher, key);
    if (result === undefined && unstableIfNotFound)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  public getKeyValueAsJson<T = unknown>(key: string, unstableIfNotFound: boolean = false): T | undefined {
    const result = this.resource.getKeyValueString(this.instanceData.watcher, key);
    if (result === undefined) {
      if (unstableIfNotFound)
        this.instanceData.ctx.markUnstable();
      return undefined;
    }
    return JSON.parse(result) as T;
  }

  public persist(): PlTreeEntry {
    return new PlTreeEntry(this.accessorData, this.resource.id);
  }
}
