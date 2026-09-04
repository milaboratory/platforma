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

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export type StructuralFinding = {
  rule: "cross-join" | "axis-domain-mismatch" | "partial-key-fan-out";
  severity: FindingSeverity;
  /** Position in the definition, e.g. `root/innerJoin[1]`. */
  path: string;
  join: string;
  detail: string;
  rowsUpperBound?: number;
  domains?: { domain: string; children: number[] }[];
  missing?: { index: number; missing: string[] }[];
};

export type AxisDescriptor = {
  name: string;
  type: string;
  domain?: Record<string, string>;
};

export type JoinShape = {
  join: string;
  path: string;
  childCount: number;
  axisUnion: string[];
  sharedAxes: string[];
  disjointPairs: [number, number][];
  inputRowsMax?: number;
  /** Loose but true: no join of these inputs can exceed the product of their rows. */
  rowsUpperBound?: number;
};

/** Joins whose entries are peers; an entry missing part of the key fans out. */
const SYMMETRIC_JOINS = new Set(["inner", "innerJoin"]);
/** Joins that union rather than intersect. */
const UNION_JOINS = new Set(["full", "fullJoin"]);
/** Joins driven by one side. */
const DRIVEN_JOINS = new Set(["outer", "outerJoin", "linkerJoin"]);

/** Structural findings for a recorded definition, most specific first. */
export function structuralFindings(def: unknown): StructuralFinding[] {
  const findings: StructuralFinding[] = [];
  visit(def, "root", (node, path) => collect(node, path, findings));
  return findings;
}

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

/** Axis identity ignoring domain, used to spot near-miss axes that fail to join. */
export function axisNameKey(axis: AxisDescriptor): string {
  return `${axis.type}|${axis.name}`;
}

/** True when a node is a join, by its discriminator. */
export function isJoinNode(node: unknown): boolean {
  const type = discriminator(node);
  return (
    type !== undefined &&
    (SYMMETRIC_JOINS.has(type) || UNION_JOINS.has(type) || DRIVEN_JOINS.has(type))
  );
}

/**
 * A join's children, by position. The V2 API wraps each child in `{ entry }`;
 * that wrapper is left in place because every read here descends through it.
 */
export function joinChildren(node: unknown): unknown[] {
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
  };
}

function collect(node: unknown, path: string, findings: StructuralFinding[]): void {
  const shape = shapeOf(node, path);
  const children = joinChildren(node);

  if (shape.disjointPairs.length > 0) {
    findings.push({
      rule: "cross-join",
      severity: "critical",
      path,
      join: shape.join,
      detail: `join siblings share no axis: pairs ${JSON.stringify(shape.disjointPairs)}`,
      rowsUpperBound: shape.rowsUpperBound,
    });
  }

  for (const nearMiss of nearMissAxes(children)) {
    findings.push({
      rule: "axis-domain-mismatch",
      severity: "high",
      path,
      join: shape.join,
      detail: `axis ${nearMiss.axis} appears with ${nearMiss.domains.length} different domains`,
      domains: nearMiss.domains,
    });
  }

  // Fan-out is worth reporting only where the node still has a working join key
  // and its entries are peers; on a cartesian node it restates the cross-join,
  // and on a driven join a narrower secondary is the intended behaviour.
  if (!SYMMETRIC_JOINS.has(shape.join) || shape.disjointPairs.length > 0) return;
  const missing = children
    .map((child, index) => {
      const own = new Set(axesUnder(child).map(axisKey));
      return { index, missing: shape.axisUnion.filter((key) => !own.has(key)) };
    })
    .filter((entry) => entry.missing.length > 0);
  if (missing.length === 0) return;
  findings.push({
    rule: "partial-key-fan-out",
    severity: "medium",
    path,
    join: shape.join,
    detail: `${missing.length} sibling(s) lack part of the node's axis union and get replicated`,
    missing,
  });
}

// Axes agreeing on name and type but disagreeing on domain never match as a
// join key, which turns an intended join into a product or an empty result.
function nearMissAxes(
  children: unknown[],
): { axis: string; domains: { domain: string; children: number[] }[] }[] {
  const byName = new Map<string, Map<string, Set<number>>>();
  for (const [index, child] of children.entries()) {
    for (const axis of axesUnder(child)) {
      const nameKey = axisNameKey(axis);
      let perDomain = byName.get(nameKey);
      if (!perDomain) byName.set(nameKey, (perDomain = new Map()));
      const domainKey = canonicalDomain(axis.domain);
      let indices = perDomain.get(domainKey);
      if (!indices) perDomain.set(domainKey, (indices = new Set()));
      indices.add(index);
    }
  }
  const out: { axis: string; domains: { domain: string; children: number[] }[] }[] = [];
  for (const [axis, perDomain] of byName) {
    if (perDomain.size < 2) continue;
    out.push({
      axis,
      domains: [...perDomain.entries()].map(([domain, indices]) => ({
        domain: domain || "(none)",
        children: [...indices],
      })),
    });
  }
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
    return SYMMETRIC_JOINS.has(join) ? Math.max(...rows) : sum(rows);
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
