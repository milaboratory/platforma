import { Branded } from '../branding';
import { PColumn, PColumnSpec } from '../drivers';
import { ResultPoolEntry } from './entry';

/** Any object exported into the result pool by the block always have spec attached to it */
export interface PObjectSpec {
  /** PObject kind discriminator */
  readonly kind: string;

  /** Additional information attached to the object */
  readonly annotations?: Record<string, string>;
}

/** Stable PObject id */
export type PObjectId = Branded<string, 'PColumnId'>;

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

export function isPColumnSpec(spec: PObjectSpec): spec is PColumnSpec {
  return spec.kind === 'PColumn';
}

export function isPColumn<T>(obj: PObject<T>): obj is PColumn<T> {
  return isPColumnSpec(obj.spec);
}

export function isPColumnSpecResult(
  r: ResultPoolEntry<PObjectSpec>
): r is ResultPoolEntry<PObjectSpec> {
  return isPColumnSpec(r.obj);
}

export function isPColumnResult<T>(
  r: ResultPoolEntry<PObject<T>>
): r is ResultPoolEntry<PColumn<T>> {
  return isPColumnSpec(r.obj.spec);
}

export function ensurePColumn<T>(obj: PObject<T>): PColumn<T> {
  if (!isPColumn(obj)) throw new Error(`not a PColumn (kind = ${obj.spec.kind})`);
  return obj;
}

export function mapPObjectData<D1, D2>(pObj: PColumn<D1>, cb: (d: D1) => D2): PColumn<D2>;
export function mapPObjectData<D1, D2>(pObj: PObject<D1>, cb: (d: D1) => D2): PObject<D2>;
export function mapPObjectData<D1, D2>(pObj: PObject<D1>, cb: (d: D1) => D2): PObject<D2> {
  return {
    ...pObj,
    data: cb(pObj.data)
  };
}
