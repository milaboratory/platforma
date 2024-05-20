import { mapValueAndError, ValueAndError } from './test_utils';
import { PlTreeResource, PlTreeState } from './tree_state';
import { TrackedAccessorProvider, Watcher } from '@milaboratory/computable';
import { FieldType, ResourceId } from '@milaboratory/pl-client-v2';

// /**
//  * Important: never store instances of this class, always get fresh instance from the backend.
//  * */
// export class ResourceTree {
//   constructor(
//     private readonly watcher: Watcher,
//     private readonly tree: PlTreeState
//   ) {
//   }
//
//   get(rid: ResourceId): PlTreeNodeAccessor | undefined {
//     const res = this.tree.get(this.watcher, rid);
//     if (!res) return undefined;
//     else return new PlTreeNodeAccessor(this.watcher, this, res);
//   }
//
//   getAndTraverse(
//     rid: ResourceId,
//     commonOptions: TraverseOptions = {},
//     ...path: (TraverseStep | string)[]
//   ) {
//     return traverse(this.get(rid), commonOptions, ...path);
//   }
//
//   getRoot(): PlTreeNodeAccessor | undefined {
//     const res = this.tree.getRoot(this.watcher);
//     if (!res) return undefined;
//     else return new PlTreeNodeAccessor(this.watcher, this, res);
//   }
//
//   traverseFromRoot(
//     commonOptions: TraverseOptions = {},
//     ...path: (TraverseStep | string)[]
//   ) {
//     return traverse(this.getRoot(), commonOptions, ...path);
//   }
// }

/** Main entry point for using PlTree in reactive setting */
export class PlTreeEntry implements TrackedAccessorProvider<PlTreeEntryAccessor> {
  constructor(
    private readonly tree: PlTreeState,
    public readonly rid: ResourceId = tree.root
  ) {
  }

  createInstance(watcher: Watcher): PlTreeEntryAccessor {
    return new PlTreeEntryAccessor(this.tree, this.rid, watcher);
  }
}

export class PlTreeEntryAccessor {
  constructor(private readonly tree: PlTreeState,
              private readonly rid: ResourceId,
              private readonly watcher: Watcher) {
  }

  node(): PlTreeNodeAccessor | undefined {
    const r = this.tree.get(this.watcher, this.rid);
    if (r === undefined)
      return undefined;
    return new PlTreeNodeAccessor(this.watcher, this.tree, r);
  }

  traverse(
    commonOptions: TraverseOptions = {},
    ...path: (TraverseStep | string)[]
  ) {
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
    private readonly resource: PlTreeResource
  ) {
  }

  private getResourceFromTree(rid: ResourceId): PlTreeNodeAccessor {
    const res = this.tree.get(this.watcher, rid);
    if (res == undefined) throw new Error(`Can't find resource ${rid}`);
    return new PlTreeNodeAccessor(this.watcher, this.tree, res);
  }

  get(
    fieldName: string,
    assertFieldType?: FieldType,
    errorIfNotFound?: boolean
  ): ValueAndError<PlTreeNodeAccessor> | undefined {
    const ve = this.resource.get(
      this.watcher,
      fieldName,
      assertFieldType,
      errorIfNotFound
    );
    if (!ve) return undefined;
    return mapValueAndError(ve, (rid) => this.getResourceFromTree(rid));
  }

  getInputsLocked(): boolean {
    return this.resource.getInputsLocked(this.watcher);
  }

  getOutputsLocked(): boolean {
    return this.resource.getOutputsLocked(this.watcher);
  }

  getIsReadyOrError(): boolean {
    return this.resource.getIsReadyOrError(this.watcher);
  }

  getError(): PlTreeNodeAccessor | undefined {
    const rid = this.resource.getError(this.watcher);
    if (rid === undefined) return undefined;
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
