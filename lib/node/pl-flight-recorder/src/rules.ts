import type {
  JoinEntry,
  SpecQueryLinkerJoin,
  SpecQueryOuterJoin,
  SpecQuerySymmetricJoin,
} from "@milaboratories/pl-model-common";
import type { DataSummary } from "./data_summary";

/**
 * Structural faults in a join, read from the recorded shape of its definition.
 *
 * Two faults make a join's output size unbounded and both are visible before any
 * data is touched: siblings that share no axis at all, which is a cartesian
 * product, and siblings whose axes agree on name and type but disagree on
 * domain, where the join key silently fails to match.
 *
 * These run in the analyzer rather than at record time. Nothing is computed on
 * the hot path, the thresholds and the rules can be revised against logs that
 * already exist, and one implementation covers every definition shape: the join
 * nodes are recognised by their discriminator and their children by position, so
 * both the original tree API and the V2 query API are read by the same walk.
 */

type AxisDescriptor = {
  name: string;
  type: string;
  domain?: Record<string, string>;
};

type JoinShape = {
  join: string;
  path: string;
  childCount: number;
  axisUnion: string[];
  sharedAxes: string[];
  disjointPairs: [number, number][];
  inputRowsMax?: number;
  /** Loose but true: no join of these inputs can exceed the product of their rows. */
  rowsUpperBound?: number;
  /**
   * Distinct values of each shared axis, as counted on the side that has fewest.
   *
   * The upper bound above is reached only when every record falls in one group.
   * These counts say how many groups there are, which is what separates a join
   * that really does produce its bound from one that merely could.
   */
  sharedAxisCardinality?: number[];
};

// The discriminators are pinned to the model's own literal types, so renaming a
// join kind in pl-model-common fails this build instead of silently disabling a
// rule. The model exports the names only as types, never as runtime constants.
type TreeJoinType = Extract<
  JoinEntry<unknown>,
  { entries: unknown } | { primary: unknown }
>["type"];
type QueryJoinType = (SpecQuerySymmetricJoin | SpecQueryOuterJoin | SpecQueryLinkerJoin)["type"];

/** Joins that keep only keys present in every entry; an entry missing part of the key fans out. */
const INTERSECT_JOINS: ReadonlySet<string> = new Set(["inner", "innerJoin"] satisfies (
  | TreeJoinType
  | QueryJoinType
)[]);
/** Joins that keep keys present in any entry, filling the rest with nulls. */
const UNION_JOINS: ReadonlySet<string> = new Set(["full", "fullJoin"] satisfies (
  | TreeJoinType
  | QueryJoinType
)[]);
/** Joins driven by one side: the primary or linker decides which keys exist. */
const DRIVEN_JOINS: ReadonlySet<string> = new Set(["outer", "outerJoin", "linkerJoin"] satisfies (
  | TreeJoinType
  | QueryJoinType
)[]);

/** Shape of every join node in a definition, outermost first. */
export function joinShapes(def: unknown): JoinShape[] {
  const shapes: JoinShape[] = [];
  visit(def, "root", (node, path) => shapes.push(shapeOf(node, path)));
  return shapes;
}

/**
 * Largest input row count the definition declares, used to judge how much a
 * join amplified. Unknown when no workflow recorded chunk statistics.
 */
export function inputRowsMax(def: unknown): number | undefined {
  const rows = childRowCounts(def);
  return rows.length > 0 ? Math.max(...rows) : estimateRows(def);
}

/** Canonical axis identity, matching how join keys are formed. */
export function axisKey(axis: AxisDescriptor): string {
  return `${axis.type}|${axis.name}|${canonicalDomain(axis.domain)}`;
}

/** True when a node is a join, by its discriminator. */
function isJoinNode(node: unknown): boolean {
  const type = discriminator(node);
  return (
    type !== undefined &&
    (INTERSECT_JOINS.has(type) || UNION_JOINS.has(type) || DRIVEN_JOINS.has(type))
  );
}

/**
 * A join's children, by position. The V2 API wraps each child in `{ entry }`;
 * that wrapper is left in place because every read here descends through it.
 */
function joinChildren(node: unknown): unknown[] {
  const record = asRecord(node);
  if (!record) return [];
  if (Array.isArray(record.entries)) return record.entries;
  const driven = [record.primary ?? record.linker, ...toArray(record.secondary)];
  return driven.filter((child) => child !== undefined && child !== null);
}

/** Axis descriptors anywhere beneath a node, deduplicated by identity. */
export function axesUnder(node: unknown): AxisDescriptor[] {
  const out = new Map<string, AxisDescriptor>();
  gatherAxes(node, out, 0);
  return [...out.values()];
}

type ColumnDescriptor = { name?: string; valueType?: string };

/** Every leaf column a definition reads, in walk order. */
export function columnsUnder(def: unknown): ColumnDescriptor[] {
  const out: ColumnDescriptor[] = [];
  gatherColumns(def, out, 0);
  return out;
}

// Internals

const MAX_WALK_DEPTH = 40;

function visit(
  node: unknown,
  path: string,
  onJoin: (node: unknown, path: string) => void,
  depth = 0,
): void {
  if (depth > MAX_WALK_DEPTH || !isTraversable(node)) return;
  if (isJoinNode(node)) {
    onJoin(node, path);
    const join = discriminator(node) ?? "join";
    for (const [index, child] of joinChildren(node).entries()) {
      visit(child, `${path}/${join}[${index}]`, onJoin, depth + 1);
    }
    return;
  }
  for (const child of childValues(node)) visit(child, path, onJoin, depth + 1);
}

function shapeOf(node: unknown, path: string): JoinShape {
  const join = discriminator(node) ?? "join";
  const children = joinChildren(node);
  const keySets = children.map((child) => new Set(axesUnder(child).map(axisKey)));

  const union = new Set<string>();
  for (const set of keySets) for (const key of set) union.add(key);

  const disjointPairs: [number, number][] = [];
  for (let i = 0; i < keySets.length; i++) {
    for (let j = i + 1; j < keySets.length; j++) {
      if (keySets[i].size === 0 || keySets[j].size === 0) continue;
      if ([...keySets[i]].some((key) => keySets[j].has(key))) continue;
      disjointPairs.push([i, j]);
    }
  }

  const rows = children.map(estimateRows);
  const known = rows.filter((value): value is number => typeof value === "number");
  return {
    join,
    path,
    childCount: children.length,
    axisUnion: [...union],
    sharedAxes: [...union].filter((key) => keySets.every((set) => set.has(key))),
    disjointPairs,
    inputRowsMax: known.length > 0 ? Math.max(...known) : undefined,
    rowsUpperBound: known.length === rows.length && known.length > 0 ? product(known) : undefined,
    sharedAxisCardinality: sharedCardinality(
      children,
      [...union].filter((key) => keySets.every((set) => set.has(key))),
    ),
  };
}

/**
 * Distinct values of each shared axis, taken from the side that has fewest.
 *
 * An inner join keeps only keys both sides carry, so the smaller count is the
 * one that survives it. A count is reported only when every side knows its own:
 * a missing one would silently turn the minimum into a guess.
 */
function sharedCardinality(children: unknown[], sharedAxes: string[]): number[] | undefined {
  if (sharedAxes.length === 0 || children.length === 0) return undefined;
  const perChild = children.map((child) => axisCardinalities(child));
  const counts = sharedAxes.map((axis) => {
    const known = perChild.map((map) => map.get(axis)).filter((n) => n !== undefined);
    return known.length === perChild.length ? Math.min(...known) : undefined;
  });
  return counts.every((count) => count !== undefined) ? counts : undefined;
}

/** Distinct values per axis of every leaf column under a node, keyed by axis. */
function axisCardinalities(node: unknown, depth = 0, out = new Map<string, number>()) {
  if (depth > MAX_WALK_DEPTH || !isTraversable(node)) return out;
  const record = asRecord(node);
  const spec = asRecord(record?.spec);
  const axes = spec?.axesSpec;
  const counts = (asRecord(record?.data) as { axisCardinality?: unknown } | undefined)
    ?.axisCardinality;
  if (Array.isArray(axes) && Array.isArray(counts) && axes.length === counts.length) {
    for (const [index, item] of axes.entries()) {
      const axis = asAxis(item);
      const count = counts[index];
      if (!axis || typeof count !== "number") continue;
      const key = axisKey(axis);
      // The smallest count wins: it is the one an intersecting join leaves.
      const seen = out.get(key);
      out.set(key, seen === undefined ? count : Math.min(seen, count));
    }
    return out;
  }
  for (const child of childValues(node)) axisCardinalities(child, depth + 1, out);
  return out;
}

function estimateRows(node: unknown, depth = 0): number | undefined {
  if (depth > MAX_WALK_DEPTH || !isTraversable(node)) return undefined;
  if (isJoinNode(node)) {
    const join = discriminator(node) ?? "";
    const rows = joinChildren(node)
      .map((child) => estimateRows(child, depth + 1))
      .filter((value): value is number => typeof value === "number");
    if (rows.length === 0) return undefined;
    // An intersection cannot exceed its largest input; a union adds up.
    return INTERSECT_JOINS.has(join) ? Math.max(...rows) : sum(rows);
  }
  const own = ownRows(node);
  if (own !== undefined) return own;
  const rows = childValues(node)
    .map((child) => estimateRows(child, depth + 1))
    .filter((value): value is number => typeof value === "number");
  return rows.length > 0 ? Math.max(...rows) : undefined;
}

function childRowCounts(def: unknown): number[] {
  const shapes = joinShapes(def);
  return shapes
    .map((shape) => shape.inputRowsMax)
    .filter((value): value is number => typeof value === "number");
}

function ownRows(node: unknown): number | undefined {
  const record = asRecord(node);
  if (!record) return undefined;
  for (const key of ["data", "dataInfo"]) {
    const summary = record[key] as DataSummary | undefined;
    if (!summary || typeof summary !== "object") continue;
    if (typeof summary.rows === "number") return summary.rows;
    if (typeof summary.entries === "number") return summary.entries;
  }
  return undefined;
}

function gatherColumns(node: unknown, out: ColumnDescriptor[], depth: number): void {
  if (depth > MAX_WALK_DEPTH || !isTraversable(node)) return;
  const record = asRecord(node);
  const spec = asRecord(record?.spec);
  // A column is anything carrying a spec with axes; that is what the digest
  // preserves for both the tree API and the query API.
  if (spec && Array.isArray(spec.axesSpec)) {
    out.push({
      name: typeof spec.name === "string" ? spec.name : undefined,
      valueType: typeof spec.valueType === "string" ? spec.valueType : undefined,
    });
    return;
  }
  for (const child of childValues(node)) gatherColumns(child, out, depth + 1);
}

function gatherAxes(node: unknown, out: Map<string, AxisDescriptor>, depth: number): void {
  if (depth > MAX_WALK_DEPTH || !isTraversable(node)) return;
  const record = asRecord(node);
  if (record) {
    for (const key of ["axesSpec", "axes"]) {
      const value = record[key];
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        const axis = asAxis(item);
        if (axis) out.set(axisKey(axis), axis);
      }
    }
  }
  for (const child of childValues(node)) gatherAxes(child, out, depth + 1);
}

function asAxis(value: unknown): AxisDescriptor | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const { name, type, domain } = record;
  if (typeof name !== "string" || typeof type !== "string") return undefined;
  return { name, type, domain: plainStringMap(domain) };
}

function plainStringMap(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function canonicalDomain(domain: Record<string, string> | undefined): string {
  return Object.entries(domain ?? {})
    .sort(([lhs], [rhs]) => (lhs < rhs ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function discriminator(node: unknown): string | undefined {
  const type = asRecord(node)?.type;
  return typeof type === "string" ? type : undefined;
}

function childValues(node: unknown): unknown[] {
  if (Array.isArray(node)) return node;
  const record = asRecord(node);
  return record ? Object.values(record) : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isTraversable(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function product(values: number[]): number {
  return values.reduce((acc, value) => acc * value, 1);
}
