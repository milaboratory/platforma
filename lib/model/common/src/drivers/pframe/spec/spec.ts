import {
  canonicalizeJson,
  type CanonicalizedJson,
  type StringifiedJson,
} from '../../../json';
import type {
  PObject,
  PObjectId,
  PObjectSpec,
} from '../../../pool';

export const ValueType = {
  Int: 'Int',
  Long: 'Long',
  Float: 'Float',
  Double: 'Double',
  String: 'String',
  Bytes: 'Bytes',
} as const;

/** PFrame columns and axes within them may store one of these types. */
export type ValueType = (typeof ValueType)[keyof typeof ValueType];

export type Metadata = Record<string, string>;

export function readMetadata<U extends Metadata, T extends keyof U = keyof U>(
  metadata: Metadata | undefined,
  key: T,
) {
  return (metadata as U | undefined)?.[key];
}

/// Well-known domains
export const Domain = {
  Alphabet: 'pl7.app/alphabet',
  BlockId: 'pl7.app/blockId',
} as const;

export type Domain = Metadata & Partial<{
  [Domain.Alphabet]: 'nucleotide' | 'aminoacid' | string;
  [Domain.BlockId]: string;
}>;

/// Helper function for reading domain values
/// Warning: always decode the result of this function inside try-catch!
export function readDomain<T extends keyof Domain>(
  spec: { domain?: Metadata | undefined } | undefined,
  key: T,
) {
  return readMetadata<Domain, T>(spec?.domain, key);
}

/// Well-known annotations
export const Annotation = {
  Alphabet: 'pl7.app/alphabet',
  DiscreteValues: 'pl7.app/discreteValues',
  Format: 'pl7.app/format',
  Graph: {
    IsVirtual: 'pl7.app/graph/isVirtual',
  },
  HideDataFromUi: 'pl7.app/hideDataFromUi',
  IsLinkerColumn: 'pl7.app/isLinkerColumn',
  Label: 'pl7.app/label',
  Max: 'pl7.app/max',
  Min: 'pl7.app/min',
  Parents: 'pl7.app/parents',
  Sequence: {
    Annotation: {
      Mapping: 'pl7.app/sequence/annotation/mapping',
    },
    IsAnnotation: 'pl7.app/sequence/isAnnotation',
  },
  Table: {
    FontFamily: 'pl7.app/table/fontFamily',
    OrderPriority: 'pl7.app/table/orderPriority',
    Visibility: 'pl7.app/table/visibility',
  },
  Trace: 'pl7.app/trace',
} as const;

export type Annotation = Metadata & Partial<{
  [Annotation.Alphabet]: 'nucleotide' | 'aminoacid' | string;
  [Annotation.DiscreteValues]: StringifiedJson<number[]> | StringifiedJson<string[]>;
  [Annotation.Format]: string;
  [Annotation.Graph.IsVirtual]: 'true';
  [Annotation.HideDataFromUi]: 'true';
  [Annotation.IsLinkerColumn]: 'true';
  [Annotation.Label]: string;
  [Annotation.Max]: `${number}`;
  [Annotation.Min]: `${number}`;
  [Annotation.Parents]: StringifiedJson<AxisSpec[]>;
  [Annotation.Sequence.Annotation.Mapping]: StringifiedJson<Record<string, string>>;
  [Annotation.Sequence.IsAnnotation]: 'true';
  [Annotation.Table.FontFamily]: string;
  [Annotation.Table.OrderPriority]: `${number}`;
  [Annotation.Table.Visibility]: 'hidden' | 'optional' | string;
  [Annotation.Trace]: StringifiedJson<Record<string, unknown>>;
}>;

/// Helper function for reading annotation values
/// Warning: always decode the result of this function inside try-catch!
export function readAnnotation<T extends keyof Annotation>(
  spec: { annotations?: Metadata | undefined } | undefined,
  key: T,
) {
  return readMetadata<Annotation, T>(spec?.annotations, key);
}

/**
 * Specification of an individual axis.
 *
 * Each axis is a part of a composite key that addresses data inside the PColumn.
 *
 * Each record inside a PColumn is addressed by a unique tuple of values set for
 * all the axes specified in the column spec.
 * */
export interface AxisSpec {
  /** Type of the axis value. Should not use non-key types like float or double. */
  readonly type: ValueType;

  /** Name of the axis */
  readonly name: string;

  /** Adds auxiliary information to the axis name, type and parents to form a
   * unique identifier */
  readonly domain?: Record<string, string>;

  /** Any additional information attached to the axis that does not affect its
   * identifier */
  readonly annotations?: Record<string, string>;

  /**
   * Parent axes provide contextual grouping for the axis in question, establishing
   * a hierarchy where the current axis is dependent on one or more axes for its
   * full definition and meaning. For instance, in a data structure where each
   * "container" axis may contain multiple "item" axes, the `item` axis would
   * list the index of the `container` axis in this field to denote its dependency.
   *
   * This means that the identity or significance of the `item` axis is only
   * interpretable when combined with its parent `container` axis. An `item` axis
   * index by itself may be non-unique and only gains uniqueness within the context
   * of its parent `container`. Therefore, the `parentAxes` field is essential for
   * mapping these relationships and ensuring data coherence across nested or
   * multi-level data models.
   *
   * A list of zero-based indices of parent axes in the overall axes specification
   * from the column spec. Each index corresponds to the position of a parent axis
   * in the list that defines the structure of the data model.
   */
  readonly parentAxes?: number[];
}

/** Parents are specs, not indexes; normalized axis can be used considering its parents independently from column */
export interface AxisSpecNormalized extends Omit<AxisSpec, 'parentAxes'> {
  parentAxesSpec: AxisSpecNormalized[];
}

/** Common type representing spec for all the axes in a column */
export type AxesSpec = AxisSpec[];

/// Well-known column names
export const PColumnName = {
  Label: 'pl7.app/label',
  Table: {
    RowSelection: 'pl7.app/table/row-selection',
  },
} as const;

/**
 * Full column specification including all axes specs and specs of the column
 * itself.
 *
 * A PColumn in its essence represents a mapping from a fixed size, explicitly
 * typed tuple to an explicitly typed value.
 *
 * (axis1Value1, axis2Value1, ...) -> columnValue
 *
 * Each element in tuple correspond to the axis having the same index in axesSpec.
 * */
export interface PUniversalColumnSpec extends PObjectSpec {
  /** Defines specific type of BObject, the most generic type of unit of
   * information in Platforma Project. */
  readonly kind: 'PColumn';

  /** Type of column values */
  readonly valueType: string;

  /** Column name */
  readonly name: string;

  /** Adds auxiliary information to the axis name, type and parents to form a
   * unique identifier */
  readonly domain?: Record<string, string>;

  /** Any additional information attached to the column that does not affect its
   * identifier */
  readonly annotations?: Record<string, string>;

  /** A list of zero-based indices of parent axes from the {@link axesSpec} array. */
  readonly parentAxes?: number[];

  /** Axes specifications */
  readonly axesSpec: AxesSpec;
}

/**
 * Specification of a data column.
 *
 * Data column is a specialized type of PColumn that stores only simple values (strings and numbers)
 * addressed by multiple keys. This is in contrast to other PColumn variants that can store more complex
 * values like files or other abstract data types. Data columns are optimized for storing and processing
 * basic tabular data.
 */
export interface PDataColumnSpec extends PUniversalColumnSpec {
  /** Type of column values */
  readonly valueType: ValueType;
}

// @todo: change this to PUniversalColumnSpec
export type PColumnSpec = PDataColumnSpec;

/** Unique PColumnSpec identifier */
export type PColumnSpecId = {
  /** Defines specific type of BObject, the most generic type of unit of
   * information in Platforma Project. */
  readonly kind: 'PColumn';

  /** Type of column values */
  readonly valueType: ValueType;

  /** Column name */
  readonly name: string;

  /** Adds auxiliary information to the axis name, type and parents to form a
   * unique identifier */
  readonly domain?: Record<string, string>;

  /** A list of zero-based indices of parent axes from the {@link axesSpec} array. */
  readonly parentAxes?: number[];

  /** Axes id */
  readonly axesId: AxesId;
};

export function getPColumnSpecId(spec: PColumnSpec): PColumnSpecId {
  return {
    kind: spec.kind,
    valueType: spec.valueType,
    name: spec.name,
    domain: spec.domain,
    parentAxes: spec.parentAxes,
    axesId: getAxesId(spec.axesSpec),
  };
}

export interface PColumn<Data> extends PObject<Data> {
  /** PColumn spec, allowing it to be found among other PObjects */
  readonly spec: PColumnSpec;
}

/** Columns in a PFrame also have internal identifier, this object represents
 * combination of specs and such id */
export interface PColumnIdAndSpec {
  /** Internal column id within the PFrame */
  readonly columnId: PObjectId;

  /** Column spec */
  readonly spec: PColumnSpec;
}

/** Get column id and spec from a column */
export function getColumnIdAndSpec<Data>(column: PColumn<Data>): PColumnIdAndSpec {
  return {
    columnId: column.id,
    spec: column.spec,
  };
}

/** Information returned by {@link PFrame.listColumns} method */
export interface PColumnInfo extends PColumnIdAndSpec {
  /** True if data was associated with this PColumn */
  readonly hasData: boolean;
}

export interface AxisId {
  /** Type of the axis or column value. For an axis should not use non-key
   * types like float or double. */
  readonly type: ValueType;

  /** Name of the axis or column */
  readonly name: string;

  /** Adds auxiliary information to the axis or column name and type to form a
   * unique identifier */
  readonly domain?: Record<string, string>;
}

/** Array of axis ids */
export type AxesId = AxisId[];

/** Extracts axis ids from axis spec */
export function getAxisId(spec: AxisSpec): AxisId {
  const { type, name, domain } = spec;
  const result = { type, name };
  if (domain && Object.entries(domain).length > 0) {
    Object.assign(result, { domain });
  }
  return result;
}

/** Extracts axes ids from axes spec array from column spec */
export function getAxesId(spec: AxesSpec): AxesId {
  return spec.map(getAxisId);
}

/** Canonicalizes axis id */
export function canonicalizeAxisId(id: AxisId): CanonicalizedJson<AxisId> {
  return canonicalizeJson(getAxisId(id));
}

/** Returns true if all domains from query are found in target */
function matchDomain(query?: Record<string, string>, target?: Record<string, string>) {
  if (query === undefined) return target === undefined;
  if (target === undefined) return true;
  for (const k in target) {
    if (query[k] !== target[k]) return false;
  }
  return true;
}

/** Returns whether "match" axis id is compatible with the "query" */
export function matchAxisId(query: AxisId, target: AxisId): boolean {
  return query.name === target.name && matchDomain(query.domain, target.domain);
}
