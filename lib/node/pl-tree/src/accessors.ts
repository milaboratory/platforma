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
  NullResourceId,
  OptionalResourceId
} from '@milaboratory/pl-client-v2';
import { mapValueAndError, ValueAndError } from './value_and_error';
import {
  CommonFieldTraverseOps,
  FieldTraversalStep,
  GetFieldStep,
  ResourceTraversalOps
} from './traversal_ops';
import { ValueOrError } from './value_or_error';
import { ZodType, z } from 'zod';
import { Optional, Writable } from 'utility-types';

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

/** A DTO that can be got from PlTreeEntry and a ComputableCtx */
export type ResourceSnapshot<
  Data = undefined,
  Fields extends Record<string, ResourceId | undefined> | undefined = undefined,
  KV extends Record<string, unknown> | undefined = undefined
> = {
  readonly id: ResourceId;
  readonly type: ResourceType;
  readonly data: Data;
  readonly fields: Fields;
  readonly kv: KV;
};

/** The most generic type of ResourceSnapshot. */
type ResourceSnapshotGeneric = ResourceSnapshot<
  unknown,
  Record<string, ResourceId | undefined> | undefined,
  Record<string, unknown> | undefined
>;

/** Request that we'll pass to getResourceSnapshot function. We infer the type of ResourceSnapshot from this. */
export type ResourceSnapshotSchema<
  Data extends ZodType | 'raw' | undefined = undefined,
  Fields extends Record<string, boolean> | undefined = undefined,
  KV extends Record<string, ZodType | 'raw'> | undefined = undefined
> = {
  readonly data: Data;
  readonly fields: Fields;
  readonly kv: KV;
};

/** Creates ResourceSnapshotSchema. It converts an optional schema type to schema type. */
export function rsSchema<
  const Data extends ZodType | 'raw' | undefined = undefined,
  const Fields extends Record<string, boolean> | undefined = undefined,
  const KV extends Record<string, ZodType | 'raw'> | undefined = undefined
>(
  schema: Optional<ResourceSnapshotSchema<Data, Fields, KV>>
): ResourceSnapshotSchema<Data, Fields, KV> {
  return schema as any;
}

/** The most generic type of ResourceSnapshotSchema. */
type ResourceSnapshotSchemaGeneric = ResourceSnapshotSchema<
  ZodType | 'raw' | undefined,
  Record<string, boolean> | undefined,
  Record<string, ZodType | 'raw'> | undefined
>;

/**
 * If Data is 'raw' in schema, we'll get bytes,
 * if it's Zod, we'll parse it via zod.
 * Or else we just got undefined in the field.
 */
type InferDataType<Data extends ZodType | 'raw' | undefined> = Data extends 'raw'
  ? Uint8Array
  : Data extends ZodType
    ? z.infer<Data>
    : undefined;

/**
 * If Fields is a record of field names to booleans,
 * then if the value of the field is true, we'll require this field and throw a Error if it wasn't found.
 * If it's false and doesn't exist, we'll return undefined.
 * If Fields type is undefined, we won't set fields at all.
 */
type InferFieldsType<Fields extends Record<string, boolean> | undefined> = Fields extends undefined
  ? undefined
  : {
      [FieldName in keyof Fields]: Fields[FieldName] extends true
        ? ResourceId
        : ResourceId | undefined;
    };

/**
 * If KV is undefined, won't set it.
 * If one of values is Zod, we'll get KV and converts it to Zod schema.
 * If the value is 'raw', just returns bytes.
 */
type InferKVType<KV extends Record<string, ZodType | 'raw'> | undefined> = KV extends undefined
  ? undefined
  : {
      [FieldName in keyof KV]: KV[FieldName] extends ZodType ? z.infer<KV[FieldName]> : Uint8Array;
    };

/** Infer ResourceSnapshot from ResourceShapshotSchema, S can be any ResourceSnapshotSchema. */
export type InferSnapshot<S extends ResourceSnapshotSchemaGeneric> = ResourceSnapshot<
  InferDataType<S['data']>,
  InferFieldsType<S['fields']>,
  InferKVType<S['kv']>
>;

/** Gets a ResourceSnapshot from PlTreeEntry. */
export function getResourceSnapshot<Schema extends ResourceSnapshotSchemaGeneric>(
  ctx: ComputableCtx,
  res: PlTreeEntry | InferSnapshot<Schema>,
  schema: Schema
): InferSnapshot<Schema> {
  if (!(res instanceof PlTreeEntry)) return res;

  const node = ctx.accessor(res).node();
  const info = node.resourceInfo;
  const result: Optional<Writable<ResourceSnapshotGeneric>, 'data' | 'fields' | 'kv'> = { ...info };

  if (schema.data !== undefined) {
    if (schema.data === 'raw') result.data = node.getData();
    else result.data = schema.data.parse(node.getDataAsJson());
  }

  if (schema.fields !== undefined) {
    const fields: Record<string, ResourceId | undefined> = {};
    for (const [fieldName, required] of Object.entries(schema.fields))
      fields[fieldName] = node.traverse({ field: fieldName, errorIfFieldNotSet: required })?.id;
    result.fields = fields;
  }

  if (schema.kv !== undefined) {
    const kv: Record<string, unknown> = {};
    for (const [fieldName, type] of Object.entries(schema.kv)) {
      const value = node.getKeyValue(fieldName);

      if (value === undefined) {
        throw new Error(`Key not found ${fieldName}`);
      } else if (type === 'raw') {
        kv[fieldName] = value;
      } else {
        kv[fieldName] = type.parse(JSON.parse(Buffer.from(value).toString('utf-8')));
      }
    }
    result.kv = kv;
  }

  return result as any;
}

/** Tries to get ResourceSnapshot and returns a error if something went wrong. */
export function tryGetResourceSnapshot<Schema extends ResourceSnapshotSchemaGeneric>(
  ctx: ComputableCtx,
  res: PlTreeEntry | InferSnapshot<Schema>,
  schema: Schema
): ValueOrError<InferSnapshot<Schema>, any> {
  try {
    return { ok: true, value: getResourceSnapshot(ctx, res, schema) };
  } catch (e: any) {
    return { ok: false, error: e };
  }
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

export type ResourceWithMetadata = {
  readonly id: ResourceId;
  readonly type: ResourceType;
  readonly metadata: Record<string, any>;
};

export function treeEntryToResourceWithMetadata(
  res: PlTreeEntry | ResourceWithMetadata,
  mdKeys: string[],
  ctx: ComputableCtx
): ResourceWithMetadata {
  if (!(res instanceof PlTreeEntry)) return res;

  const node = ctx.accessor(res as PlTreeEntry).node();
  const info = node.resourceInfo;
  const mdEntries: [string, any][] = mdKeys.map((k) => [k, node.getKeyValue(k)]);

  return {
    ...info,
    metadata: Object.fromEntries(mdEntries)
  };
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

  public get originalId(): OptionalResourceId {
    this.instanceData.guard();
    return this.resource.originalResourceId;
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
        errorIfFieldNotSet: true;
      }
    ]
  ): PlTreeNodeAccessor;
  public traverse(...steps: (FieldTraversalStep | string)[]): PlTreeNodeAccessor | undefined;
  public traverse(...steps: (FieldTraversalStep | string)[]): PlTreeNodeAccessor | undefined {
    return this.traverseWithCommon({}, ...steps);
  }

  public traverseOrError(
    ...steps: [
      Omit<FieldTraversalStep, 'errorIfFieldNotSet'> & {
        errorIfFieldNotSet: true;
      }
    ]
  ): ValueOrError<PlTreeNodeAccessor, string>;
  public traverseOrError(
    ...steps: (FieldTraversalStep | string)[]
  ): ValueOrError<PlTreeNodeAccessor, string> | undefined;
  public traverseOrError(
    ...steps: (FieldTraversalStep | string)[]
  ): ValueOrError<PlTreeNodeAccessor, string> | undefined {
    return this.traverseOrErrorWithCommon({}, ...steps);
  }

  public traverseWithCommon(
    commonOptions: CommonFieldTraverseOps,
    ...steps: (FieldTraversalStep | string)[]
  ): PlTreeNodeAccessor | undefined {
    const result = this.traverseOrErrorWithCommon(commonOptions, ...steps);
    if (result === undefined) return undefined;
    if (!result.ok) throw new PlError(result.error);
    return result.value;
  }

  public traverseOrErrorWithCommon(
    commonOptions: CommonFieldTraverseOps,
    ...steps: (FieldTraversalStep | string)[]
  ): ValueOrError<PlTreeNodeAccessor, string> | undefined {
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
        return {
          ok: false,
          error: `error in field ${step.field} of ${resourceIdToString(current.id)}: ${next.error.getDataAsString()}`
        };

      if (next.value === undefined) {
        if (step.errorIfFieldNotSet)
          return {
            ok: false,
            error: `field have no assigned value ${step.field} of ${resourceIdToString(current.id)}`
          };
        return undefined;
      }

      current = next.value;
    }
    return { ok: true, value: current };
  }

  private readonly onUnstableLambda = () => this.instanceData.ctx.markUnstable();

  public getField(
    _step:
      | (Omit<GetFieldStep, 'errorIfFieldNotFound'> & { errorIfFieldNotFound: true })
      | (Omit<GetFieldStep, 'errorIfFieldNotSet'> & { errorIfFieldNotSet: true })
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

  /**
   * Can be used to passe a higher level accessor that will wrap the resource and throw its
   * errors on node resolution.
   * */
  public toEntryAccessor(): PlTreeEntryAccessor {
    return new PlTreeEntryAccessor(this.accessorData, this.tree, this.id, this.instanceData);
  }

  /** Can be passed to nested computable. */
  public persist(): PlTreeEntry {
    return new PlTreeEntry(this.accessorData, this.resource.id);
  }
}
