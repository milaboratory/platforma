import { PlTreeResource, PlTreeState } from './state';
import { ComputableCtx, TrackedAccessorProvider, UsageGuard, Watcher } from '@milaboratory/computable';
import { FieldType, ResourceId } from '@milaboratory/pl-client-v2';
import { mapValueAndError, ValueAndError } from './value_and_error';

/** Main entry point for using PlTree in reactive setting */
export class PlTreeEntry implements TrackedAccessorProvider<PlTreeEntryAccessor> {
  constructor(
    private readonly tree: PlTreeState,
    public readonly rid: ResourceId = tree.root
  ) {
  }

  createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): PlTreeEntryAccessor {
    return new PlTreeEntryAccessor(this.tree, this.rid, watcher, guard, ctx);
  }
}

export class PlTreeEntryAccessor {
  constructor(private readonly tree: PlTreeState,
              private readonly rid: ResourceId,
              private readonly watcher: Watcher,
              private readonly guard: UsageGuard,
              private readonly ctx: ComputableCtx
  ) {
  }

  node(): PlTreeNodeAccessor | undefined {
    this.guard();
    const r = this.tree.get(this.watcher, this.rid);
    if (r === undefined) {
      // resource may appear later, so in a broad sense this result is unstable,
      // regardless the FinalPredicate
      this.ctx.markUnstable();
      return undefined;
    }
    return new PlTreeNodeAccessor(this.watcher, this.tree, r, this.guard, this.ctx);
  }

  traverse(
    commonOptions: TraverseOptions = {},
    ...path: (TraverseStep | string)[]
  ): ValueAndError<PlTreeNodeAccessor> | undefined {
    return traverse(this.node(), commonOptions, ...path);
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
    private readonly watcher: Watcher,
    private readonly tree: PlTreeState,
    private readonly resource: PlTreeResource,
    private readonly guard: UsageGuard,
    private readonly ctx: ComputableCtx
  ) {
  }

  private getResourceFromTree(rid: ResourceId): PlTreeNodeAccessor {
    const res = this.tree.get(this.watcher, rid);
    if (res == undefined) throw new Error(`Can't find resource ${rid}`);
    return new PlTreeNodeAccessor(this.watcher, this.tree, res, this.guard, this.ctx);
  }

  get(
    fieldName: string,
    assertFieldType?: FieldType,
    errorIfNotFound?: boolean
  ): ValueAndError<PlTreeNodeAccessor> | undefined {
    this.guard();
    const ve = this.resource.get(
      this.watcher,
      fieldName,
      assertFieldType,
      errorIfNotFound,
      () => this.ctx.markUnstable()
    );
    if (ve === undefined) return undefined;
    return mapValueAndError(ve, (rid) => this.getResourceFromTree(rid));
  }

  getInputsLocked(): boolean {
    this.guard();
    const result = this.resource.getInputsLocked(this.watcher);
    if (!result)
      this.ctx.markUnstable();
    return result;
  }

  getOutputsLocked(): boolean {
    this.guard();
    const result = this.resource.getOutputsLocked(this.watcher);
    if (!result)
      this.ctx.markUnstable();
    return result;
  }

  getIsReadyOrError(): boolean {
    this.guard();
    const result = this.resource.getIsReadyOrError(this.watcher);
    if (!result)
      this.ctx.markUnstable();
    return result;
  }

  getIsFinal() {
    this.guard();
    return this.resource.getIsFinal(this.watcher);
  }

  getError(): PlTreeNodeAccessor | undefined {
    this.guard();
    const rid = this.resource.getError(this.watcher);
    if (rid === undefined) {
      // in general, errors should not appear after resource is ready,
      // so we will consider such cases stable
      if (!this.getIsReadyOrError())
        this.ctx.markUnstable();
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

  persist(): PlTreeEntry {
    return new PlTreeEntry(this.tree, this.resource.id);
  }

  traverse(
    commonOptions: TraverseOptions = {},
    ...path: (TraverseStep | string)[]
  ) {
    return traverse(this, commonOptions, ...path);
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
