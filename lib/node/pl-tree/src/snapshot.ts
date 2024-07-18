import { ResourceId, ResourceType } from '@milaboratory/pl-client-v2';
import { Optional, Writable } from 'utility-types';
import { ZodType, z } from 'zod';
import { PlTreeEntry, PlTreeEntryAccessor, PlTreeNodeAccessor } from './accessors';
import { ComputableCtx } from '@milaboratory/computable';
import { notEmpty } from '@milaboratory/ts-helpers';

/**
 * A DTO that can be generated from a tree node to make a snapshot of specific parts of it's state.
 * Such snapshots can then be used in core that requires this information without the need of
 * retrieving state from the tree.
 */
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
export function makeResourceSnapshot<Schema extends ResourceSnapshotSchemaGeneric>(
  res: PlTreeEntry,
  schema: Schema,
  ctx: ComputableCtx
): InferSnapshot<Schema>;
export function makeResourceSnapshot<Schema extends ResourceSnapshotSchemaGeneric>(
  res: PlTreeEntryAccessor | PlTreeNodeAccessor,
  schema: Schema
): InferSnapshot<Schema>;
export function makeResourceSnapshot<Schema extends ResourceSnapshotSchemaGeneric>(
  res: PlTreeEntry | PlTreeEntryAccessor | PlTreeNodeAccessor,
  schema: Schema,
  ctx?: ComputableCtx
): InferSnapshot<Schema> {
  const node =
    res instanceof PlTreeEntry
      ? notEmpty(ctx).accessor(res).node()
      : res instanceof PlTreeEntryAccessor
        ? res.node()
        : res;
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

/** @deprecated */
export type ResourceWithData = {
  readonly id: ResourceId;
  readonly type: ResourceType;
  readonly fields: Map<string, ResourceId | undefined>;
  readonly data?: Uint8Array;
};

/** @deprecated */
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

/** @deprecated */
export type ResourceWithMetadata = {
  readonly id: ResourceId;
  readonly type: ResourceType;
  readonly metadata: Record<string, any>;
};

/** @deprecated */
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
