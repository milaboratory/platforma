import { ensureError } from '../../../errors';
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
import { z } from 'zod';

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
): U[T] | undefined {
  return (metadata as U | undefined)?.[key];
}

type MetadataJsonImpl<M> = {
  [P in keyof M as (M[P] extends StringifiedJson ? P : never)]: M[P] extends StringifiedJson<infer U> ? z.ZodType<U> : never;
};
export type MetadataJson<M> = MetadataJsonImpl<Required<M>>;

export function readMetadataJsonOrThrow<M extends Metadata, T extends keyof MetadataJson<M>>(
  metadata: Metadata | undefined,
  metadataJson: MetadataJson<M>,
  key: T,
  methodNameInError: string = 'readMetadataJsonOrThrow',
): z.infer<MetadataJson<M>[T]> | undefined {
  const json = readMetadata<M, T>(metadata, key);
  if (json === undefined) return undefined;

  const schema = metadataJson[key];
  try {
    const value = JSON.parse(json);
    return schema.parse(value);
  } catch (error: unknown) {
    throw new Error(
      `${methodNameInError} failed, `
      + `key: ${String(key)}, `
      + `value: ${json}, `
      + `error: ${ensureError(error)}`,
    );
  }
}

export function readMetadataJson<M extends Metadata, T extends keyof MetadataJson<M>>(
  metadata: Metadata | undefined,
  metadataJson: MetadataJson<M>,
  key: T,
): z.infer<MetadataJson<M>[T]> | undefined {
  try {
    return readMetadataJsonOrThrow(metadata, metadataJson, key);
  } catch {
    return undefined; // treat invalid values as unset
  }
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

export type DomainJson = MetadataJson<Domain>;
export const DomainJson: DomainJson = {};

/// Helper function for reading plain domain values
export function readDomain<T extends keyof Domain>(
  spec: { domain?: Metadata | undefined } | undefined,
  key: T,
): Domain[T] | undefined {
  return readMetadata<Domain, T>(spec?.domain, key);
}

/// Helper function for reading json-encoded domain values, throws on JSON parsing error
export function readDomainJsonOrThrow<T extends keyof DomainJson>(
  spec: { domain?: Metadata | undefined } | undefined,
  key: T,
): z.infer<DomainJson[T]> | undefined {
  return readMetadataJsonOrThrow<Domain, T>(spec?.domain, DomainJson, key, 'readDomainJsonOrThrow');
}

/// Helper function for reading json-encoded domain values, returns undefined on JSON parsing error
export function readDomainJson<T extends keyof DomainJson>(
  spec: { domain?: Metadata | undefined } | undefined,
  key: T,
): z.infer<DomainJson[T]> | undefined {
  return readMetadataJson<Domain, T>(spec?.domain, DomainJson, key);
}

/// Well-known annotations
export const Annotation = {
  AxisNature: 'pl7.app/axisNature',
  Alphabet: 'pl7.app/alphabet',
  Description: 'pl7.app/description',
  DiscreteValues: 'pl7.app/discreteValues',
  Format: 'pl7.app/format',
  Graph: {
    Axis: {
      HighCardinality: 'pl7.app/graph/axis/highCardinality',
      LowerLimit: 'pl7.app/graph/axis/lowerLimit',
      SymmetricRange: 'pl7.app/graph/axis/symmetricRange',
      UpperLimit: 'pl7.app/graph/axis/upperLimit',
    },
    IsDenseAxis: 'pl7.app/graph/isDenseAxis',
    IsVirtual: 'pl7.app/graph/isVirtual',
    Palette: 'pl7.app/graph/palette',
    Thresholds: 'pl7.app/graph/thresholds',
    TreatAbsentValuesAs: 'pl7.app/graph/treatAbsentValuesAs',
  },
  HideDataFromUi: 'pl7.app/hideDataFromUi',
  HideDataFromGraphs: 'pl7.app/hideDataFromGraphs',
  IsDiscreteFilter: 'pl7.app/isDiscreteFilter',
  IsLinkerColumn: 'pl7.app/isLinkerColumn',
  IsSubset: 'pl7.app/isSubset',
  Label: 'pl7.app/label',
  Max: 'pl7.app/max',
  Min: 'pl7.app/min',
  MultipliesBy: 'pl7.app/multipliesBy',
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
  [Annotation.AxisNature]: 'homogeneous' | 'heterogeneous' | 'scaleCompatible' | string;
  [Annotation.Description]: string;
  [Annotation.DiscreteValues]: StringifiedJson<number[]> | StringifiedJson<string[]>;
  [Annotation.Format]: string;
  [Annotation.Graph.Axis.HighCardinality]: StringifiedJson<boolean>;
  [Annotation.Graph.Axis.LowerLimit]: StringifiedJson<number>;
  [Annotation.Graph.Axis.SymmetricRange]: StringifiedJson<boolean>;
  [Annotation.Graph.Axis.UpperLimit]: StringifiedJson<number>;
  [Annotation.Graph.IsDenseAxis]: StringifiedJson<boolean>;
  [Annotation.Graph.IsVirtual]: StringifiedJson<boolean>;
  [Annotation.Graph.Palette]: StringifiedJson<{ mapping: Record<string, number>; name: string }>;
  [Annotation.Graph.Thresholds]: StringifiedJson<{ columnId: { valueType: ValueType; name: string }; value: number }[]>;
  [Annotation.Graph.TreatAbsentValuesAs]: StringifiedJson<number>;
  [Annotation.HideDataFromUi]: StringifiedJson<boolean>;
  [Annotation.HideDataFromGraphs]: StringifiedJson<boolean>;
  [Annotation.IsDiscreteFilter]: StringifiedJson<boolean>;
  [Annotation.IsLinkerColumn]: StringifiedJson<boolean>;
  [Annotation.IsSubset]: StringifiedJson<boolean>;
  [Annotation.Label]: string;
  [Annotation.Max]: StringifiedJson<number>;
  [Annotation.Min]: StringifiedJson<number>;
  [Annotation.MultipliesBy]: StringifiedJson<AxisSpec['name'][]>;
  [Annotation.Parents]: StringifiedJson<AxisSpec['name'][]>;
  [Annotation.Sequence.Annotation.Mapping]: StringifiedJson<Record<string, string>>;
  [Annotation.Sequence.IsAnnotation]: StringifiedJson<boolean>;
  [Annotation.Table.FontFamily]: string;
  [Annotation.Table.OrderPriority]: StringifiedJson<number>;
  [Annotation.Table.Visibility]: 'hidden' | 'optional' | string;
  [Annotation.Trace]: StringifiedJson<Record<string, unknown>>;
}>;

// export const AxisSpec = z.object({
//   type: z.nativeEnum(ValueType),
//   name: z.string(),
//   domain: z.record(z.string(), z.string()).optional(),
//   annotations: z.record(z.string(), z.string()).optional(),
//   parentAxes: z.array(z.number()).optional(),
// }).passthrough();
//
// type Expect<T extends true> = T;
// type Equal<X, Y> =
// (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
//
// type _test = Expect<Equal<
//   Readonly<z.infer<typeof AxisSpec>>,
//   Readonly<AxisSpec & Record<string, unknown>>
// >>;

export type AnnotationJson = MetadataJson<Annotation>;

const ValueTypeSchema = z.enum(['Int', 'Long', 'Float', 'Double', 'String'] as const);
export const AnnotationJson: AnnotationJson = {
  [Annotation.DiscreteValues]: z.array(z.string()).or(z.array(z.number())),
  [Annotation.Graph.Axis.HighCardinality]: z.boolean(),
  [Annotation.Graph.Axis.LowerLimit]: z.number(),
  [Annotation.Graph.Axis.UpperLimit]: z.number(),
  [Annotation.Graph.Axis.SymmetricRange]: z.boolean(),
  [Annotation.Graph.IsDenseAxis]: z.boolean(),
  [Annotation.Graph.Palette]: z.object({ mapping: z.record(z.number()), name: z.string() }),
  [Annotation.Graph.Thresholds]: z.array(
    z.object({
      columnId: z.object({ valueType: ValueTypeSchema, name: z.string() }),
      value: z.number(),
    }),
  ),
  [Annotation.Graph.TreatAbsentValuesAs]: z.number(),
  [Annotation.Graph.IsVirtual]: z.boolean(),
  [Annotation.HideDataFromUi]: z.boolean(),
  [Annotation.HideDataFromGraphs]: z.boolean(),
  [Annotation.IsDiscreteFilter]: z.boolean(),
  [Annotation.IsLinkerColumn]: z.boolean(),
  [Annotation.IsSubset]: z.boolean(),
  [Annotation.Max]: z.number(),
  [Annotation.Min]: z.number(),
  [Annotation.MultipliesBy]: z.array(z.string()),
  [Annotation.Parents]: z.array(z.string()),
  [Annotation.Sequence.Annotation.Mapping]: z.record(z.string(), z.string()),
  [Annotation.Sequence.IsAnnotation]: z.boolean(),
  [Annotation.Table.OrderPriority]: z.number(),
  [Annotation.Trace]: z.record(z.string(), z.unknown()),
};

/// Helper function for reading plain annotation values
export function readAnnotation<T extends keyof Annotation>(
  spec: { annotations?: Metadata | undefined } | undefined,
  key: T,
): Annotation[T] | undefined {
  return readMetadata<Annotation, T>(spec?.annotations, key);
}

/// Helper function for reading json-encoded annotation values, throws on JSON parsing error
export function readAnnotationJsonOrThrow<T extends keyof AnnotationJson>(
  spec: { annotations?: Metadata | undefined } | undefined,
  key: T,
): z.infer<AnnotationJson[T]> | undefined {
  return readMetadataJsonOrThrow<Annotation, T>(spec?.annotations, AnnotationJson, key, 'readAnnotationJsonOrThrow');
}

/// Helper function for reading json-encoded annotation values, returns undefined on JSON parsing error
export function readAnnotationJson<T extends keyof AnnotationJson>(
  spec: { annotations?: Metadata | undefined } | undefined,
  key: T,
): z.infer<AnnotationJson[T]> | undefined {
  return readMetadataJson<Annotation, T>(spec?.annotations, AnnotationJson, key);
}

/**
 * Specification of an individual axis.
 *
 * Each axis is a part of a composite key that addresses data inside the PColumn.
 *
 * Each record inside a PColumn is addressed by a unique tuple of values set for
 * all the axes specified in the column spec.
 */
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

/** Tree: axis is a root, its parents are children */
export type AxisTree = {
  axis: AxisSpecNormalized;
  children: AxisTree[]; // parents
};

function makeAxisTree(axis: AxisSpecNormalized): AxisTree {
  return { axis, children: [] };
}

/** Build tree by axis parents annotations */
export function getAxesTree(rootAxis: AxisSpecNormalized): AxisTree {
  const root = makeAxisTree(rootAxis);
  let nodesQ = [root];
  while (nodesQ.length) {
    const nextNodes: AxisTree[] = [];
    for (const node of nodesQ) {
      node.children = node.axis.parentAxesSpec.map(makeAxisTree);
      nextNodes.push(...node.children);
    }
    nodesQ = nextNodes;
  }
  return root;
}

/** Get set of canonicalized axisIds from axisTree */
export function getSetFromAxisTree(tree: AxisTree): Set<CanonicalizedJson<AxisId>> {
  const set = new Set([canonicalizeJson(getAxisId(tree.axis))]);
  let nodesQ = [tree];
  while (nodesQ.length) {
    const nextNodes = [];
    for (const node of nodesQ) {
      for (const parent of node.children) {
        set.add(canonicalizeJson(getAxisId(parent.axis)));
        nextNodes.push(parent);
      }
    }
    nodesQ = nextNodes;
  }
  return set;
}

/** Get array of axisSpecs from axisTree */
export function getArrayFromAxisTree(tree: AxisTree): AxisSpecNormalized[] {
  const res = [tree.axis];
  let nodesQ = [tree];
  while (nodesQ.length) {
    const nextNodes = [];
    for (const node of nodesQ) {
      for (const parent of node.children) {
        res.push(parent.axis);
        nextNodes.push(parent);
      }
    }
    nodesQ = nextNodes;
  }
  return res;
}

export function canonicalizeAxisWithParents(axis: AxisSpecNormalized) {
  return canonicalizeJson(getArrayFromAxisTree(getAxesTree(axis)).map(getAxisId));
}

function normalizingAxesComparator(axis1: AxisSpecNormalized, axis2: AxisSpecNormalized): 1 | -1 | 0 {
  if (axis1.name !== axis2.name) {
    return axis1.name < axis2.name ? 1 : -1;
  }
  if (axis1.type !== axis2.type) {
    return axis1.type < axis2.type ? 1 : -1;
  }
  const domain1 = canonicalizeJson(axis1.domain ?? {});
  const domain2 = canonicalizeJson(axis2.domain ?? {});
  if (domain1 !== domain2) {
    return domain1 < domain2 ? 1 : -1;
  }

  const parents1 = canonicalizeAxisWithParents(axis1);
  const parents2 = canonicalizeAxisWithParents(axis2);

  if (parents1 !== parents2) {
    return parents1 < parents2 ? 1 : -1;
  }

  const annotation1 = canonicalizeJson(axis1.annotations ?? {});
  const annotation2 = canonicalizeJson(axis2.annotations ?? {});
  if (annotation1 !== annotation2) {
    return annotation1 < annotation2 ? 1 : -1;
  }
  return 0;
}

function parseParentsFromAnnotations(axis: AxisSpec) {
  const parentsList = readAnnotationJson(axis, Annotation.Parents);
  if (parentsList === undefined) {
    return [];
  }
  return parentsList;
}

function sortParentsDeep(axisSpec: AxisSpecNormalized) {
  axisSpec.parentAxesSpec.forEach(sortParentsDeep);
  axisSpec.parentAxesSpec.sort(normalizingAxesComparator);
}

function hasCycleOfParents(axisSpec: AxisSpecNormalized) {
  const root = makeAxisTree(axisSpec);
  let nodesQ = [root];
  const ancestors = new Set(canonicalizeJson(getAxisId(axisSpec)));
  while (nodesQ.length) {
    const nextNodes: AxisTree[] = [];
    const levelIds = new Set<CanonicalizedJson<AxisId>>();
    for (const node of nodesQ) {
      node.children = node.axis.parentAxesSpec.map(makeAxisTree);
      for (const child of node.children) {
        const childId = canonicalizeJson(getAxisId(child.axis));
        if (!levelIds.has(childId)) {
          nextNodes.push(child);
          levelIds.add(childId);
          if (ancestors.has(childId)) {
            return true;
          }
          ancestors.add(childId);
        }
      }
    }
    nodesQ = nextNodes;
  }
  return false;
}

/** Create list of normalized axisSpec (parents are in array of specs, not indexes) */
export function getNormalizedAxesList(axes: AxisSpec[]): AxisSpecNormalized[] {
  if (!axes.length) {
    return [];
  }
  const modifiedAxes: AxisSpecNormalized[] = axes.map((axis) => {
    const { parentAxes: _, ...copiedRest } = axis;
    return { ...copiedRest, annotations: { ...copiedRest.annotations }, parentAxesSpec: [] };
  });

  axes.forEach((axis, idx) => {
    const modifiedAxis = modifiedAxes[idx];
    if (axis.parentAxes) { // if we have parents by indexes then take from the list
      modifiedAxis.parentAxesSpec = axis.parentAxes.map((idx) => modifiedAxes[idx]);
    } else { // else try to parse from annotation name
      const parents = parseParentsFromAnnotations(axis).map((name) => modifiedAxes.find((axis) => axis.name === name));
      modifiedAxis.parentAxesSpec = parents.some((p) => p === undefined) ? [] : parents as AxisSpecNormalized[];

      delete modifiedAxis.annotations?.[Annotation.Parents];
    }
  });

  if (modifiedAxes.some(hasCycleOfParents)) { // Axes list is broken
    modifiedAxes.forEach((axis) => {
      axis.parentAxesSpec = [];
    });
  } else {
    modifiedAxes.forEach((axis) => {
      sortParentsDeep(axis);
    });
  }

  return modifiedAxes;
}

/** Create list of regular axisSpec from normalized (parents are indexes, inside of current axes list) */
export function getDenormalizedAxesList(axesSpec: AxisSpecNormalized[]): AxisSpec[] {
  const idsList = axesSpec.map((axisSpec) => canonicalizeJson(getAxisId(axisSpec)));
  return axesSpec.map((axisSpec) => {
    const parentsIds = axisSpec.parentAxesSpec.map((axisSpec) => canonicalizeJson(getAxisId(axisSpec)));
    const parentIdxs = parentsIds.map((id) => idsList.indexOf(id));
    const { parentAxesSpec: _, ...copiedRest } = axisSpec;
    if (parentIdxs.length) {
      return { ...copiedRest, parentAxes: parentIdxs } as AxisSpec;
    }
    return copiedRest;
  });
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
 */
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
