import type { JoinEntry, PColumn, PColumnSpec } from "../drivers";
import { assertNever } from "../util";
import { PlRef } from "../ref";
import { CanonicalizedJson, canonicalizeJson, parseJsonSafely } from "../json";
import { Branded } from "@milaboratories/helpers";

/** Any object exported into the result pool by the block always have spec attached to it */
export type PObjectSpec = {
  /** PObject kind discriminator */
  readonly kind: string;

  /** Name is common part of PObject identity */
  readonly name: string;

  /** Domain is a set of key-value pairs that can be used to identify the object */
  readonly domain?: Record<string, string>;

  /** Context domain provides additional axis/column identity that is matched
   * by kinship rules (subset/superset/overlap) rather than exact equality */
  readonly contextDomain?: Record<string, string>;

  /** Additional information attached to the object */
  readonly annotations?: Record<string, string>;
};

export type LocalPObjectKey = { resolvePath: string[]; name: string };
export type LocalPObjectId = Branded<CanonicalizedJson<LocalPObjectKey>, "LocalPObjectId">;
export type GlobalPObjectKey = PlRef;
export type GlobalPObjectId = Branded<CanonicalizedJson<GlobalPObjectKey>, "GlobalPObjectId">;
/** Stable PObject id */
export type PObjectId = LocalPObjectId | GlobalPObjectId;

export function isPObjectId(value: unknown): value is PObjectId {
  if (typeof value !== "string") return false;
  return isPObjectKey(parseJsonSafely(value));
}

export function isPObjectKey(value: unknown): value is LocalPObjectKey | GlobalPObjectKey {
  return isLocalPObjectKey(value) || isGlobalPObjectKey(value);
}

export function createPObjectId(obj: LocalPObjectKey | GlobalPObjectKey): PObjectId {
  if (isLocalPObjectKey(obj)) {
    return createLocalPObjectId(obj.resolvePath, obj.name);
  }
  if (isGlobalPObjectKey(obj)) {
    return createGlobalPObjectId(obj.blockId, obj.name);
  }
  throw new Error(`createPObjectId: unrecognized object key structure: ${JSON.stringify(obj)}`);
}

export function createLocalPObjectId(resolvePath: string[], name: string): PObjectId {
  return canonicalizeJson({ resolvePath, name }) as PObjectId;
}

export function isLocalPObjectId(value: unknown): value is LocalPObjectId {
  if (typeof value !== "string") return false;
  return isLocalPObjectKey(parseJsonSafely<LocalPObjectKey>(value));
}

export function isLocalPObjectKey(value: unknown): value is LocalPObjectKey {
  if (typeof value !== "object" || value === null) return false;
  const v = value as LocalPObjectKey;
  return Array.isArray(v.resolvePath) && typeof v.name === "string";
}

export function createGlobalPObjectId(blockId: string, exportName: string): PObjectId {
  return canonicalizeJson({
    __isRef: true,
    blockId,
    name: exportName,
  } satisfies PlRef) as PObjectId;
}

export function isGlobalPObjectKey(value: unknown): value is GlobalPObjectKey {
  if (typeof value !== "object" || value === null) return false;
  return "__isRef" in value && "blockId" in value && "name" in value;
}

export function isGlobalPObjectId(value: unknown): value is GlobalPObjectId {
  if (typeof value !== "string") return false;
  const parsed = parseJsonSafely<GlobalPObjectKey>(value);
  return isGlobalPObjectKey(parsed);
}

/**
 * Full PObject representation.
 *
 * @template Data type of the object referencing or describing the "data" part of the PObject
 * */
export interface PObject<Data> {
  /** Fully rendered PObjects are assigned a stable identifier. */
  readonly id: PObjectId;

  /** PObject spec, allowing it to be found among other PObjects */
  readonly spec: PObjectSpec;

  /** A handle to data object */
  readonly data: Data;
}

export function isPObject<Data>(obj: unknown): obj is PObject<Data> {
  return typeof obj === "object" && obj !== null && "id" in obj && "spec" in obj && "data" in obj;
}

export function isPColumn<T>(obj: unknown): obj is PColumn<T> {
  return isPObject(obj) && isPColumnSpec(obj.spec);
}

export function isPColumnSpec(spec: PObjectSpec): spec is PColumnSpec {
  return spec.kind === "PColumn";
}

export function ensurePColumn<T>(obj: PObject<T>): PColumn<T> {
  if (!isPColumn(obj)) throw new Error(`not a PColumn (kind = ${obj.spec.kind})`);
  return obj;
}

export function mapPObjectData<D1, D2>(pObj: PColumn<D1>, cb: (d: D1) => D2): PColumn<D2>;
export function mapPObjectData<D1, D2>(
  pObj: PColumn<D1> | undefined,
  cb: (d: D1) => D2,
): PColumn<D2> | undefined;
export function mapPObjectData<D1, D2>(pObj: PObject<D1>, cb: (d: D1) => D2): PObject<D2>;
export function mapPObjectData<D1, D2>(
  pObj: PObject<D1> | undefined,
  cb: (d: D1) => D2,
): PObject<D2> | undefined;
export function mapPObjectData<D1, D2>(
  pObj: PObject<D1> | undefined,
  cb: (d: D1) => D2,
): PObject<D2> | undefined {
  return pObj === undefined
    ? undefined
    : {
        ...pObj,
        data: cb(pObj.data),
      };
}

export function extractAllColumns<D>(entry: JoinEntry<PColumn<D>>): PColumn<D>[] {
  const columns = new Map<PObjectId, PColumn<D>>();
  const addAllColumns = (entry: JoinEntry<PColumn<D>>) => {
    switch (entry.type) {
      case "column":
        columns.set(entry.column.id, entry.column);
        return;
      case "slicedColumn":
        columns.set(entry.column.id, entry.column);
        return;
      case "artificialColumn":
        columns.set(entry.column.id, entry.column);
        return;
      case "inlineColumn":
        return;
      case "full":
      case "inner":
        for (const e of entry.entries) addAllColumns(e);
        return;
      case "outer":
        addAllColumns(entry.primary);
        for (const e of entry.secondary) addAllColumns(e);
        return;
      default:
        assertNever(entry);
    }
  };
  addAllColumns(entry);
  return [...columns.values()];
}
