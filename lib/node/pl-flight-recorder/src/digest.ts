import crypto from "node:crypto";
import type {
  AxisSpec,
  JoinEntry,
  PColumn,
  PColumnSpec,
  PTableDef,
  PTableDefV2,
  PTableRecordFilter,
  PTableSorting,
} from "@milaboratories/pl-model-common";

/**
 * Reduces a model-built join request to a small, data-free description that is
 * still enough to explain a blow-up.
 *
 * Two jobs. First, redaction: a report a customer is asked to send must carry no
 * customer data, so schema survives and every value is dropped or replaced by a
 * hash and a length. Second, structural analysis from specs alone, before any
 * data is touched — two faults produce unbounded output and both are visible
 * here: siblings of a join that share no axis at all, and siblings whose axes
 * agree on name and type but disagree on domain, where the join key silently
 * fails to match.
 */

export const REDACTION = {
  kept: [
    "column names",
    "value types",
    "axis names/types/domains",
    "annotation keys",
    "row and byte counts",
  ],
  dropped: [
    "cell values",
    "filter reference values",
    "annotation values",
    "inline column payloads",
  ],
} as const;

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type StructuralFinding = {
  rule: "cross-join" | "axis-domain-mismatch" | "partial-key-fan-out";
  severity: FindingSeverity;
  /** Position in the join tree, e.g. `root/inner[1]/outer[0]`. */
  path: string;
  join: string;
  detail: string;
  rowsUpperBound?: number;
  domains?: { domain: string; children: number[] }[];
  missing?: { index: number; missing: string[] }[];
};

export type AxisDigest = {
  name: string;
  type: string;
  domain?: Record<string, string>;
  contextDomain?: Record<string, string>;
  parentAxes?: number[];
  /** Canonical join identity: type, name and domain. */
  id: string;
};

export type SpecDigest = {
  name?: string;
  valueType?: string;
  domain?: Record<string, string>;
  contextDomain?: Record<string, string>;
  annotationKeys?: string[];
  axes: AxisDigest[];
  unknown?: true;
};

export type DataDigest = {
  kind: string;
  entries?: number;
  approxBytes?: number;
  keyLength?: number;
  partitionKeyLength?: number;
  parts?: number;
  partsWithStats?: number;
  rows?: number;
  bytes?: number;
};

export type ColumnDigest = {
  k?: string;
  id?: string;
  spec: SpecDigest;
  data: DataDigest;
  axisKeys: string[];
  rows?: number;
  bytes?: number;
  axisFilters?: { axisIndex: number; constant: HashedValue }[];
  axesIndices?: number[];
};

export type JoinNodeDigest = ColumnDigest & {
  k: string;
  children?: JoinNodeDigest[];
  primaryIndex?: number;
  axisUnion?: string[];
  sharedAxes?: string[];
  /** Index pairs of siblings with no axis in common. */
  disjointPairs?: [number, number][];
  partialKey?: { index: number; missing: string[] }[];
  nearMissAxes?: { axis: string; domains: { domain: string; children: number[] }[] }[];
  inputRowsMax?: number;
  inputRowsSum?: number;
  /** Loose but true bound: no join of these inputs can exceed their product. */
  rowsUpperBound?: number;
  rowsKnownForAllInputs?: boolean;
};

export type HashedValue = { hash: string; len: number } | null;

export type FilterDigest = {
  type?: string;
  column?: { type: string; axis?: string; column?: string };
  predicate: {
    operator?: string;
    reference?: HashedValue;
    referenceType?: string;
    referenceCount?: number;
  };
};

export type PTableDefDigest = {
  kind: "PTableDef";
  tree: JoinNodeDigest;
  findings: StructuralFinding[];
  partitionFilters: FilterDigest[];
  filters: FilterDigest[];
  sorting: { column?: FilterDigest["column"]; ascending?: boolean }[];
};

export type PTableDefV2Digest = { kind: "PTableDefV2"; query: unknown };

export type PFrameDefDigest = {
  kind: "PFrameDef";
  columnCount: number;
  columns: ColumnDigest[];
  inputRows?: number;
  inputBytes?: number;
};

export type DefDigest = PTableDefDigest | PTableDefV2Digest | PFrameDefDigest;

/** Anything the seam may hand over; column payloads are opaque here. */
type AnyColumn = PColumn<unknown>;

/** Redacted join tree plus the structural faults found in it. */
export function digestJoinTree(src: JoinEntry<AnyColumn>): {
  tree: JoinNodeDigest;
  findings: StructuralFinding[];
} {
  const tree = digestNode(src);
  return { tree, findings: collectFindings(tree) };
}

/** Redacted description of a full table def: join tree, filters and sorting. */
export function digestPTableDef(def: PTableDef<AnyColumn>): PTableDefDigest {
  const { tree, findings } = digestJoinTree(def.src);
  return {
    kind: "PTableDef",
    tree,
    findings,
    partitionFilters: (def.partitionFilters ?? []).map(digestFilter),
    filters: (def.filters ?? []).map(digestFilter),
    sorting: (def.sorting ?? []).map(digestSorting),
  };
}

/** Redacted description of a query-based def; unknown node kinds degrade gracefully. */
export function digestPTableDefV2(def: PTableDefV2<AnyColumn>): PTableDefV2Digest {
  return { kind: "PTableDefV2", query: digestQueryNode((def as { query?: unknown })?.query) };
}

/** Redacted description of a frame def, which is a flat list of columns. */
export function digestPFrameDef(def: readonly AnyColumn[]): PFrameDefDigest {
  const columns = (def ?? []).map((column) => digestColumn(column));
  return {
    kind: "PFrameDef",
    columnCount: columns.length,
    columns,
    inputRows: sumKnown(columns.map((c) => c.rows)),
    inputBytes: sumKnown(columns.map((c) => c.bytes)),
  };
}

/** Schema-only view of a column spec. Annotation values are dropped: labels carry user text. */
export function digestSpec(spec: PColumnSpec | undefined): SpecDigest {
  if (!spec || typeof spec !== "object") return { axes: [], unknown: true };
  return {
    name: spec.name,
    valueType: spec.valueType,
    domain: spec.domain ? clampValues(spec.domain) : undefined,
    contextDomain: spec.contextDomain ? clampValues(spec.contextDomain) : undefined,
    annotationKeys: spec.annotations ? Object.keys(spec.annotations).sort() : undefined,
    axes: (spec.axesSpec ?? []).map((axis) => ({
      name: axis.name,
      type: axis.type,
      domain: axis.domain ? clampValues(axis.domain) : undefined,
      contextDomain: axis.contextDomain ? clampValues(axis.contextDomain) : undefined,
      parentAxes: axis.parentAxes ? [...axis.parentAxes] : undefined,
      id: axisKey(axis),
    })),
  };
}

/** Canonical axis identity, matching how join keys are formed: type, name, domain. */
export function axisKey(axis: Pick<AxisSpec, "type" | "name" | "domain"> | undefined): string {
  return `${axis?.type}|${axis?.name}|${axis?.domain ? canonicalMap(axis.domain) : ""}`;
}

/** Axis identity ignoring domain, used to spot near-miss axes that fail to join. */
export function axisNameKey(axis: Pick<AxisSpec, "type" | "name"> | undefined): string {
  return `${axis?.type}|${axis?.name}`;
}

/** Counts and sizes for a column payload, never the payload. */
export function digestData(data: unknown): DataDigest {
  if (data === null || data === undefined) return { kind: "absent" };
  if (Array.isArray(data)) {
    // Inline values, built inside the model sandbox.
    return { kind: "inline", entries: data.length, approxBytes: approxInlineBytes(data) };
  }
  if (typeof data !== "object") return { kind: typeof data };

  const info = data as { type?: string; [key: string]: unknown };
  switch (info.type) {
    case "Json":
      return {
        kind: "Json",
        keyLength: info.keyLength as number | undefined,
        entries: countKeys(info.data),
      };
    case "JsonPartitioned":
    case "BinaryPartitioned":
      return {
        kind: info.type,
        partitionKeyLength: info.partitionKeyLength as number | undefined,
        parts: countKeys(info.parts),
      };
    case "ParquetPartitioned":
      return digestParquet(info);
    default:
      return { kind: info.type ?? "opaque" };
  }
}

/** Filter shape with the reference value replaced by a hash and a cardinality. */
export function digestFilter(filter: PTableRecordFilter | undefined): FilterDigest {
  const predicate =
    (filter as { predicate?: Record<string, unknown> } | undefined)?.predicate ?? {};
  const redacted: FilterDigest["predicate"] = {
    operator: predicate.operator as string | undefined,
  };
  if ("reference" in predicate) {
    redacted.reference = hashValue(predicate.reference);
    redacted.referenceType = typeof predicate.reference;
  }
  if ("references" in predicate) {
    redacted.referenceCount = (predicate.references as unknown[] | undefined)?.length ?? 0;
  }
  return {
    type: (filter as { type?: string } | undefined)?.type,
    column: digestColumnRef((filter as { column?: unknown } | undefined)?.column),
    predicate: redacted,
  };
}

// Internals

type JoinEntryLike = {
  type?: string;
  column?: AnyColumn;
  entries?: JoinEntryLike[];
  primary?: JoinEntryLike;
  secondary?: JoinEntryLike[];
  axisFilters?: { axisIndex: number; constant: string | number }[];
  axesIndices?: number[];
};

function digestNode(entry: unknown): JoinNodeDigest {
  const node = entry as JoinEntryLike | null;
  if (!node || typeof node !== "object") return emptyNode("unknown");

  switch (node.type) {
    case "column":
    case "inlineColumn":
      return { ...digestColumn(node.column), k: node.type };
    case "slicedColumn":
      return {
        ...digestColumn(node.column),
        k: "slicedColumn",
        // Slicing pins an axis to one value, removing a dimension, so it only
        // ever shrinks the output; position is recorded, the value is not.
        axisFilters: (node.axisFilters ?? []).map((filter) => ({
          axisIndex: filter.axisIndex,
          constant: hashValue(filter.constant),
        })),
      };
    case "artificialColumn":
      return {
        ...digestColumn(node.column),
        k: "artificialColumn",
        axesIndices: node.axesIndices ? [...node.axesIndices] : undefined,
      };
    case "inner":
    case "full": {
      const children = (node.entries ?? []).map(digestNode);
      return { ...emptyNode(node.type), children, ...joinShape(children) };
    }
    case "outer": {
      const children = [digestNode(node.primary), ...(node.secondary ?? []).map(digestNode)];
      return { ...emptyNode("outer"), primaryIndex: 0, children, ...joinShape(children) };
    }
    default:
      return emptyNode(`unknown:${node.type}`);
  }
}

function emptyNode(kind: string): JoinNodeDigest {
  return { k: kind, spec: { axes: [], unknown: true }, data: { kind: "absent" }, axisKeys: [] };
}

function digestColumn(column: AnyColumn | undefined): ColumnDigest {
  const spec = digestSpec(column?.spec as PColumnSpec | undefined);
  const data = digestData(column?.data);
  return {
    id: typeof column?.id === "string" ? shortHash(column.id) : undefined,
    spec,
    data,
    axisKeys: spec.axes.map((axis) => axis.id),
    rows: data.rows ?? data.entries,
    bytes: data.bytes ?? data.approxBytes,
  };
}

// Derives a join node's axis union and the structural faults that make its
// output size unbounded.
function joinShape(children: JoinNodeDigest[]): Partial<JoinNodeDigest> {
  const keySets = children.map((child) => new Set(collectAxisKeys(child)));
  const union = new Set<string>();
  for (const set of keySets) for (const key of set) union.add(key);

  const sharedAxes = [...union].filter((key) => keySets.every((set) => set.has(key)));

  const disjointPairs: [number, number][] = [];
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      if (keySets[i].size === 0 || keySets[j].size === 0) continue;
      if ([...keySets[i]].some((key) => keySets[j].has(key))) continue;
      disjointPairs.push([i, j]);
    }
  }

  const partialKey = children
    .map((child, index) => {
      const own = new Set(collectAxisKeys(child));
      return { index, missing: [...union].filter((key) => !own.has(key)) };
    })
    .filter((entry) => entry.missing.length > 0);

  const rows = children.map(aggregateRows);
  const known = rows.filter((value): value is number => typeof value === "number");

  return {
    axisUnion: [...union],
    sharedAxes,
    disjointPairs,
    partialKey,
    nearMissAxes: findNearMissAxes(children),
    inputRowsMax: known.length > 0 ? Math.max(...known) : undefined,
    inputRowsSum: known.length > 0 ? sum(known) : undefined,
    rowsUpperBound: known.length === rows.length ? product(known) : undefined,
    rowsKnownForAllInputs: known.length === rows.length,
  };
}

// Axes agreeing on name and type but disagreeing on domain never match as a
// join key, which turns an intended join into a product or an empty result.
function findNearMissAxes(children: JoinNodeDigest[]): JoinNodeDigest["nearMissAxes"] {
  const byName = new Map<string, Map<string, Set<number>>>();
  for (const [index, child] of children.entries()) {
    for (const axis of collectAxes(child)) {
      const nameKey = axisNameKey(axis as unknown as AxisSpec);
      let perDomain = byName.get(nameKey);
      if (!perDomain) byName.set(nameKey, (perDomain = new Map()));
      const domainKey = axis.domain ? canonicalMap(axis.domain) : "";
      let indices = perDomain.get(domainKey);
      if (!indices) perDomain.set(domainKey, (indices = new Set()));
      indices.add(index);
    }
  }
  const out: NonNullable<JoinNodeDigest["nearMissAxes"]> = [];
  for (const [axis, perDomain] of byName) {
    if (perDomain.size < 2) continue;
    out.push({
      axis,
      domains: [...perDomain.entries()].map(([domain, children]) => ({
        domain: domain || "(none)",
        children: [...children],
      })),
    });
  }
  return out;
}

function collectAxisKeys(node: JoinNodeDigest): string[] {
  if (!node.children) return node.axisKeys;
  const out = new Set<string>();
  for (const child of node.children) for (const key of collectAxisKeys(child)) out.add(key);
  return [...out];
}

function collectAxes(node: JoinNodeDigest): AxisDigest[] {
  if (!node.children) return node.spec.axes;
  return node.children.flatMap(collectAxes);
}

function aggregateRows(node: JoinNodeDigest): number | undefined {
  if (typeof node.rows === "number") return node.rows;
  if (!node.children) return undefined;
  const rows = node.children
    .map(aggregateRows)
    .filter((value): value is number => typeof value === "number");
  if (rows.length === 0) return undefined;
  return node.k === "inner" ? Math.max(...rows) : sum(rows);
}

function collectFindings(
  node: JoinNodeDigest,
  path = "root",
  acc: StructuralFinding[] = [],
): StructuralFinding[] {
  if (node.disjointPairs?.length) {
    acc.push({
      rule: "cross-join",
      severity: "critical",
      path,
      join: node.k,
      detail: `join siblings share no axis: pairs ${JSON.stringify(node.disjointPairs)}`,
      rowsUpperBound: node.rowsUpperBound,
    });
  }
  for (const nearMiss of node.nearMissAxes ?? []) {
    acc.push({
      rule: "axis-domain-mismatch",
      severity: "high",
      path,
      join: node.k,
      detail: `axis ${nearMiss.axis} appears with ${nearMiss.domains.length} different domains`,
      domains: nearMiss.domains,
    });
  }
  // Fan-out is worth reporting only where the node still has a working join
  // key; on a cartesian node it restates the cross-join above.
  if (node.partialKey?.length && node.k === "inner" && !node.disjointPairs?.length) {
    acc.push({
      rule: "partial-key-fan-out",
      severity: "medium",
      path,
      join: node.k,
      detail: `${node.partialKey.length} sibling(s) lack part of the node's axis union and get replicated`,
      missing: node.partialKey,
    });
  }
  for (const [index, child] of (node.children ?? []).entries()) {
    collectFindings(child, `${path}/${node.k}[${index}]`, acc);
  }
  return acc;
}

function digestParquet(info: { [key: string]: unknown }): DataDigest {
  // Chunk statistics are optional: the producing workflow fills them in, so row
  // counts are used when present and left unknown otherwise.
  const parts = Object.values((info.parts ?? {}) as Record<string, unknown>);
  let rows = 0;
  let bytes = 0;
  let withStats = 0;
  for (const part of parts) {
    const stats = (
      part as { stats?: { numberOfRows?: number; size?: { axes?: number[]; column?: number } } }
    )?.stats;
    if (!stats) continue;
    withStats++;
    if (typeof stats.numberOfRows === "number") rows += stats.numberOfRows;
    if (stats.size) bytes += (stats.size.column ?? 0) + sum(stats.size.axes ?? []);
  }
  return {
    kind: "ParquetPartitioned",
    partitionKeyLength: info.partitionKeyLength as number | undefined,
    parts: parts.length,
    partsWithStats: withStats,
    rows: withStats > 0 ? rows : undefined,
    bytes: withStats > 0 ? bytes : undefined,
  };
}

function digestQueryNode(node: unknown, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 24) return { k: "unknown" };
  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = { k: source.type ?? source.kind ?? "node" };
  if ((source.column as AnyColumn | undefined)?.spec) {
    Object.assign(out, digestColumn(source.column as AnyColumn));
  }
  for (const key of ["entries", "secondary", "children", "inputs"]) {
    const value = source[key];
    if (Array.isArray(value)) out[key] = value.map((child) => digestQueryNode(child, depth + 1));
  }
  if (source.primary) out.primary = digestQueryNode(source.primary, depth + 1);
  if (source.source) out.source = digestQueryNode(source.source, depth + 1);
  if (Array.isArray(source.filters)) {
    out.filters = source.filters.map((filter) => digestFilter(filter as PTableRecordFilter));
  }
  return out;
}

function digestColumnRef(ref: unknown): FilterDigest["column"] {
  if (!ref || typeof ref !== "object") return undefined;
  const typed = ref as { type?: string; id?: unknown };
  if (typed.type === "axis") {
    return { type: "axis", axis: axisKey(typed.id as AxisSpec | undefined) };
  }
  return {
    type: typed.type ?? "column",
    column: typeof typed.id === "string" ? shortHash(typed.id) : undefined,
  };
}

function digestSorting(sorting: PTableSorting | undefined): {
  column?: FilterDigest["column"];
  ascending?: boolean;
} {
  const typed = sorting as { column?: unknown; ascending?: boolean } | undefined;
  return { column: digestColumnRef(typed?.column), ascending: typed?.ascending };
}

function clampValues(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = typeof value === "string" && value.length > 64 ? `${value.slice(0, 64)}…` : value;
  }
  return out;
}

function canonicalMap(map: Record<string, string>): string {
  return Object.entries(map)
    .sort(([lhs], [rhs]) => (lhs < rhs ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

// Sampled rather than measured: walking millions of entries to size them is
// itself a memory risk in the situation this code exists to diagnose.
function approxInlineBytes(values: unknown[]): number {
  const sampleSize = Math.min(values.length, 64);
  if (sampleSize === 0) return 0;
  let bytes = 0;
  for (let i = 0; i < sampleSize; i++) {
    const value = values[Math.floor((i * values.length) / sampleSize)];
    bytes += JSON.stringify(value ?? null)?.length ?? 0;
  }
  return Math.round((bytes / sampleSize) * values.length);
}

function countKeys(value: unknown): number | undefined {
  return value && typeof value === "object" ? Object.keys(value).length : undefined;
}

function hashValue(value: unknown): HashedValue {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return { hash: shortHash(text), len: text.length };
}

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function sumKnown(values: (number | undefined)[]): number | undefined {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length > 0 ? sum(known) : undefined;
}

function product(values: number[]): number {
  return values.reduce((acc, value) => acc * value, 1);
}
