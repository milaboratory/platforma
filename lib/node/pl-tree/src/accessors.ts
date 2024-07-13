import { PlTreeResource, PlTreeState } from './state';
import {
  AccessorProvider,
  ComputableCtx,
  ComputableHooks,
  UsageGuard
} from '@milaboratory/computable';
import {
  ResourceId,
  resourceIdToString,
  ResourceType,
  resourceTypesEqual,
  resourceTypeToString,
  NullResourceId
} from '@milaboratory/pl-client-v2';
import { mapValueAndError, ValueAndError } from './value_and_error';
import {
  CommonFieldTraverseOps,
  FieldTraversalStep,
  GetFieldStep,
  ResourceTraversalOps
} from './traversal_ops';

/** Error encountered during traversal in field or resource. */
export class PlError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type TreeAccessorData = {
  readonly treeProvider: () => PlTreeState;
  readonly hooks?: ComputableHooks;
};

export type TreeAccessorInstanceData = {
  readonly guard: UsageGuard;
  readonly ctx: ComputableCtx;
};

/** Main entry point for using PlTree in reactive setting */
export class PlTreeEntry implements AccessorProvider<PlTreeEntryAccessor> {
  constructor(
    private readonly accessorData: TreeAccessorData,
    public readonly rid: ResourceId
  ) {}

  public createAccessor(ctx: ComputableCtx, guard: UsageGuard): PlTreeEntryAccessor {
    return new PlTreeEntryAccessor(this.accessorData, this.accessorData.treeProvider(), this.rid, {
      ctx,
      guard
    });
  }

  public toJSON(): string {
    return this.toString();
  }

  public toString(): string {
    return `[ENTRY:${resourceIdToString(this.rid)}]`;
  }
}

function getResourceFromTree(
  accessorData: TreeAccessorData,
  tree: PlTreeState,
  instanceData: TreeAccessorInstanceData,
  rid: ResourceId,
  ops: ResourceTraversalOps
): PlTreeNodeAccessor {
  const acc = new PlTreeNodeAccessor(
    accessorData,
    tree,
    tree.get(instanceData.ctx.watcher, rid),
    instanceData
  );

  if (!ops.ignoreError) {
    const err = acc.getError();
    if (err !== undefined)
      throw new PlError(
        `error encountered on resource ${resourceIdToString(acc.id)} (${resourceTypeToString(acc.resourceType)}): ${err.getDataAsString()}`
      );
  }

  if (
    ops.assertResourceType !== undefined &&
    (Array.isArray(ops.assertResourceType)
      ? ops.assertResourceType.findIndex((rt) => resourceTypesEqual(rt, acc.resourceType)) === -1
      : !resourceTypesEqual(ops.assertResourceType, acc.resourceType))
  )
    throw new Error(
      `wrong resource type ${resourceTypeToString(acc.resourceType)} but expected ${ops.assertResourceType}`
    );

  return acc;
}

export class PlTreeEntryAccessor {
  constructor(
    private readonly accessorData: TreeAccessorData,
    private readonly tree: PlTreeState,
    private readonly rid: ResourceId,
    private readonly instanceData: TreeAccessorInstanceData
  ) {}

  node(ops: ResourceTraversalOps = {}): PlTreeNodeAccessor {
    this.instanceData.guard();

    // this is the only entry point to acquire a PlTreeNodeAccessor,
    // so this is the only point where we should attach the hooks
    if (this.accessorData.hooks !== undefined)
      this.instanceData.ctx.attacheHooks(this.accessorData.hooks);

    return getResourceFromTree(this.accessorData, this.tree, this.instanceData, this.rid, ops);
  }
}

/** Helper type to simplify implementation of APIs requiring type information. */
export type ResourceInfo = {
  readonly id: ResourceId;
  readonly type: ResourceType;
};

/** Can be called only when a ctx is provided, because pl tree entry is a computable entity. */
export function treeEntryToResourceInfo(res: PlTreeEntry | ResourceInfo, ctx: ComputableCtx) {
  if (res instanceof PlTreeEntry) return ctx.accessor(res).node().resourceInfo;

  return res;
}

export type ResourceWithData = {
  readonly id: ResourceId;
  readonly type: ResourceType;
  readonly fields: Map<string, ResourceId | undefined>;
  readonly data?: Uint8Array;
};

export function treeEntryToResourceWithData(
  res: PlTreeEntry | ResourceWithData,
  fields: string[],
  ctx: ComputableCtx
): ResourceWithData {
  if (res instanceof PlTreeEntry) {
    const node = ctx.accessor(res as PlTreeEntry).node();
    const info = node.resourceInfo;

    const fValues: [string, ResourceId | undefined][] = fields.map((name) => [
      name,
      node.getField(name)?.value?.id
    ]);

    return {
      ...info,
      fields: new Map(fValues),
      data: node.getData() ?? new Uint8Array()
    };
  }

  return res;
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
  ) {}

  public get id(): ResourceId {
    this.instanceData.guard();
    return this.resource.id;
  }

  public get resourceType(): ResourceType {
    this.instanceData.guard();
    return this.resource.type;
  }

  public get resourceInfo(): ResourceInfo {
    return { id: this.id, type: this.resourceType };
  }

  private getResourceFromTree(rid: ResourceId, ops: ResourceTraversalOps): PlTreeNodeAccessor {
    return getResourceFromTree(this.accessorData, this.tree, this.instanceData, rid, ops);
  }

  public traverse(
    ...steps: [
      Omit<FieldTraversalStep, 'errorIfFieldNotSet'> & {
        errorIfFieldNotAssigned: true;
      }
    ]
  ): PlTreeNodeAccessor;
  public traverse(...steps: (FieldTraversalStep | string)[]): PlTreeNodeAccessor | undefined;
  public traverse(...steps: (FieldTraversalStep | string)[]): PlTreeNodeAccessor | undefined {
    return this.traverseWithCommon({}, ...steps);
  }

  public traverseWithCommon(
    commonOptions: CommonFieldTraverseOps,
    ...steps: (FieldTraversalStep | string)[]
  ): PlTreeNodeAccessor | undefined {
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

      if (next === undefined) return undefined;

      if (step.pureFieldErrorToUndefined && next.value === undefined && next.error !== undefined)
        return undefined;

      if ((!step.ignoreError || next.value === undefined) && next.error !== undefined)
        throw new PlError(
          `error in field ${step.field} of ${resourceIdToString(current.id)}: ${next.error.getDataAsString()}`
        );

      if (next.value === undefined) {
        if (step.errorIfFieldNotSet)
          throw new PlError(
            `field have no assigned value ${step.field} of ${resourceIdToString(current.id)}`
          );
        return undefined;
      }

      current = next.value;
    }
    return current;
  }

  private readonly onUnstableLambda = () => this.instanceData.ctx.markUnstable();

  public getField(
    _step:
      | (Omit<GetFieldStep, 'errorIfFieldNotFound'> & { errorIfFieldNotFound: true })
      | (Omit<GetFieldStep, 'errorIfFieldNotSet'> & { errorIfFieldNotAssigned: true })
  ): ValueAndError<PlTreeNodeAccessor>;
  public getField(_step: GetFieldStep | string): ValueAndError<PlTreeNodeAccessor> | undefined;
  public getField(_step: GetFieldStep | string): ValueAndError<PlTreeNodeAccessor> | undefined {
    this.instanceData.guard();
    const step: GetFieldStep = typeof _step === 'string' ? { field: _step } : _step;

    const ve = this.resource.getField(this.instanceData.ctx.watcher, step, this.onUnstableLambda);

    if (ve === undefined) return undefined;

    return mapValueAndError(ve, (rid) => this.getResourceFromTree(rid, { ignoreError: true }));
  }

  public getInputsLocked(): boolean {
    this.instanceData.guard();
    const result = this.resource.getInputsLocked(this.instanceData.ctx.watcher);
    if (!result) this.instanceData.ctx.markUnstable();
    return result;
  }

  public getOutputsLocked(): boolean {
    this.instanceData.guard();
    const result = this.resource.getOutputsLocked(this.instanceData.ctx.watcher);
    if (!result) this.instanceData.ctx.markUnstable();
    return result;
  }

  public getIsReadyOrError(): boolean {
    this.instanceData.guard();
    const result = this.resource.getIsReadyOrError(this.instanceData.ctx.watcher);
    if (!result) this.instanceData.ctx.markUnstable();
    return result;
  }

  public getIsFinal() {
    this.instanceData.guard();
    return this.resource.getIsFinal(this.instanceData.ctx.watcher);
  }

  public getError(): PlTreeNodeAccessor | undefined {
    this.instanceData.guard();
    const rid = this.resource.getError(this.instanceData.ctx.watcher);
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
    return this.resource.listInputFields(this.instanceData.ctx.watcher);
  }

  public listOutputFields(): string[] {
    this.instanceData.guard();
    return this.resource.listOutputFields(this.instanceData.ctx.watcher);
  }

  public listDynamicFields(): string[] {
    this.instanceData.guard();
    return this.resource.listDynamicFields(this.instanceData.ctx.watcher);
  }

  public getKeyValue(key: string, unstableIfNotFound: boolean = false): Uint8Array | undefined {
    this.instanceData.guard();
    const result = this.resource.getKeyValue(this.instanceData.ctx.watcher, key);
    if (result === undefined && unstableIfNotFound) this.instanceData.ctx.markUnstable();
    return result;
  }

  /** @deprecated */
  public getKeyValueString(key: string): string | undefined {
    return this.getKeyValueAsString(key);
  }

  public getKeyValueAsString(key: string, unstableIfNotFound: boolean = false): string | undefined {
    this.instanceData.guard();
    const result = this.resource.getKeyValueString(this.instanceData.ctx.watcher, key);
    if (result === undefined && unstableIfNotFound) this.instanceData.ctx.markUnstable();
    return result;
  }

  public getKeyValueAsJson<T = unknown>(
    key: string,
    unstableIfNotFound: boolean = false
  ): T | undefined {
    const result = this.resource.getKeyValueString(this.instanceData.ctx.watcher, key);
    if (result === undefined) {
      if (unstableIfNotFound) this.instanceData.ctx.markUnstable();
      return undefined;
    }
    return JSON.parse(result) as T;
  }

  public persist(): PlTreeEntry {
    return new PlTreeEntry(this.accessorData, this.resource.id);
  }
}
