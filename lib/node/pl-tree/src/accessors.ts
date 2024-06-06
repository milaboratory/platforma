import { PlTreeResource, PlTreeState } from './state';
import {
  ComputableCtx, ComputableHooks,
  TrackedAccessorProvider,
  UsageGuard,
  Watcher
} from '@milaboratory/computable';
import { FieldType, ResourceId, ResourceType } from '@milaboratory/pl-client-v2';
import { mapValueAndError, ValueAndError } from './value_and_error';
import { notEmpty } from '@milaboratory/ts-helpers';

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

export class PlTreeEntryAccessor {
  constructor(
    private readonly accessorData: TreeAccessorData,
    private readonly tree: PlTreeState,
    private readonly rid: ResourceId,
    private readonly instanceData: TreeAccessorInstanceData
  ) {
  }

  node(): PlTreeNodeAccessor | undefined {
    this.instanceData.guard();
    if (this.accessorData.hooks !== undefined)
      this.instanceData.ctx.attacheHooks(this.accessorData.hooks);
    const r = this.tree.get(this.instanceData.watcher, this.rid);
    if (r === undefined) {
      // resource may appear later, so in a broad sense this result is unstable,
      // regardless the FinalPredicate
      this.instanceData.ctx.markUnstable();
      return undefined;
    }
    return new PlTreeNodeAccessor(this.accessorData, this.tree, r, this.instanceData);
  }

  traverse(
    commonOptions: TraverseOptions = {},
    ...path: (TraverseStep | string)[]
  ): ValueAndError<PlTreeNodeAccessor> | undefined {
    return traverse(this.node(), commonOptions, ...path);
  }

  traverseNoError(
    commonOptions: TraverseOptions = {},
    ...path: (TraverseStep | string)[]
  ): PlTreeNodeAccessor | undefined {
    const result = this.traverse(commonOptions, ...path);
    if (result?.error !== undefined)
      throw new PlError(notEmpty(result.error.getDataAsString()));
    return result?.value;
  }
}

/**
 * API contracts:
 *   - API never return {@link NullResourceId}, absence of link is always modeled as `undefined`
 *
 * Important: never store instances of this class, always get fresh instance from {@link ResourceTree} accessor.
 * */
export class PlTreeNodeAccessor {
  constructor(
    private readonly accessorData: TreeAccessorData,
    private readonly tree: PlTreeState,
    private readonly resource: PlTreeResource,
    private readonly instanceData: TreeAccessorInstanceData
  ) {
  }

  get id() {
    return this.resource.id;
  }

  private getResourceFromTree(rid: ResourceId): PlTreeNodeAccessor {
    const res = this.tree.get(this.instanceData.watcher, rid);
    if (res == undefined) throw new Error(`Can't find resource ${rid}`);
    return new PlTreeNodeAccessor(this.accessorData, this.tree, res, this.instanceData);
  }

  get resourceType(): ResourceType {
    return this.resource.type;
  }

  get(
    fieldName: string,
    assertFieldType?: FieldType,
    errorIfNotFound?: boolean
  ): ValueAndError<PlTreeNodeAccessor> | undefined {
    this.instanceData.guard();
    const ve = this.resource.get(
      this.instanceData.watcher,
      fieldName,
      assertFieldType,
      errorIfNotFound,
      () => this.instanceData.ctx.markUnstable()
    );
    if (ve === undefined) return undefined;
    return mapValueAndError(ve, (rid) => this.getResourceFromTree(rid));
  }

  getInputsLocked(): boolean {
    this.instanceData.guard();
    const result = this.resource.getInputsLocked(this.instanceData.watcher);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  getOutputsLocked(): boolean {
    this.instanceData.guard();
    const result = this.resource.getOutputsLocked(this.instanceData.watcher);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  getIsReadyOrError(): boolean {
    this.instanceData.guard();
    const result = this.resource.getIsReadyOrError(this.instanceData.watcher);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  getIsFinal() {
    this.instanceData.guard();
    return this.resource.getIsFinal(this.instanceData.watcher);
  }

  getError(): PlTreeNodeAccessor | undefined {
    this.instanceData.guard();
    const rid = this.resource.getError(this.instanceData.watcher);
    if (rid === undefined) {
      // // in general, errors should not appear after resource is ready,
      // // so we will consider such cases stable
      // if (!this.getIsReadyOrError())
      //   this.ctx.markUnstable();
      return undefined;
    }
    return this.getResourceFromTree(rid);
  }

  getData(): Uint8Array | undefined {
    return this.resource.data;
  }

  getDataAsString(): string | undefined {
    return this.resource.getDataAsString();
  }

  getDataAsJson<T = unknown>(): T | undefined {
    return this.resource.getDataAsJson<T>();
  }

  traverse(
    commonOptions: TraverseOptions = {},
    ...path: (TraverseStep | string)[]
  ) {
    return traverse(this, commonOptions, ...path);
  }

  listInputFields(): string[] {
    this.instanceData.guard();
    return this.resource.listInputFields(this.instanceData.watcher);
  }

  listOutputFields(): string[] {
    this.instanceData.guard();
    return this.resource.listOutputFields(this.instanceData.watcher);
  }

  listDynamicFields(): string[] {
    this.instanceData.guard();
    return this.resource.listDynamicFields(this.instanceData.watcher);
  }

  getKeyValue(key: string): Uint8Array | undefined {
    this.instanceData.guard();
    const result = this.resource.getKeyValue(this.instanceData.watcher, key);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  getKeyValueString(key: string): string | undefined {
    this.instanceData.guard();
    const result = this.resource.getKeyValueString(this.instanceData.watcher, key);
    if (!result)
      this.instanceData.ctx.markUnstable();
    return result;
  }

  persist(): PlTreeEntry {
    return new PlTreeEntry(this.accessorData, this.resource.id);
  }
}

export interface TraverseOptions {
  /** Terminate chain if current resource is in error stat. Resource error will be returned. */
  stopOnResourceError?: boolean;
  /** Terminate chain if field is associated with an error. Field error will be returned. */
  stopOnFieldError?: boolean;
  /** Valid only if {@link assertFieldType} is defined and equal to 'Input', 'Service' or 'Output'.
   * If field is not found, and corresponding field list is locked, call will fail with exception. */
  errorIfNotFound?: boolean;
}

export interface TraverseStep extends TraverseOptions {
  /** Field name */
  field: string;
  /** Assert field type. Call will fail with exception if this assertion is not fulfilled. */
  assertFieldType?: FieldType;
  // TODO add assert resource type
}

export function traverse(
  res: PlTreeNodeAccessor | undefined,
  commonOptions: TraverseOptions = {},
  ...path: (TraverseStep | string)[]
): ValueAndError<PlTreeNodeAccessor> | undefined {
  let current: ValueAndError<PlTreeNodeAccessor> | undefined = {
    value: res
  };
  for (const _step of path) {
    const step: TraverseStep =
      typeof _step === 'string'
        ? {
          ...commonOptions,
          field: _step
        }
        : { ...commonOptions, ..._step };
    if (current === undefined || current.value === undefined)
      return undefined;
    const resourceError = current.value.getError();
    if (step.stopOnResourceError && resourceError !== undefined)
      return { error: resourceError };
    current = current.value.get(
      step.field,
      step.assertFieldType,
      step.errorIfNotFound
    );
    if (
      step.stopOnFieldError &&
      current !== undefined &&
      current.error !== undefined
    )
      return { error: current.error };
  }
  return current;
}
