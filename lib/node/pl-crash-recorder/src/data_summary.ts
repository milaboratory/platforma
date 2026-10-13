/**
 * Counts and sizes for a column payload, never the payload.
 *
 * This is the one place that has to know the shape of `DataInfo`, because the
 * numbers that predict a join's cost — rows per partition and their byte sizes —
 * live at type-specific positions inside it. Everything else about a definition
 * is recorded structurally.
 *
 * Chunk statistics are optional: the producing workflow fills them in, so row
 * counts are reported when present and left unknown otherwise rather than
 * guessed.
 */

export type DataSummary = {
  kind: string;
  /** Entries for inline or JSON payloads. */
  entries?: number;
  approxBytes?: number;
  keyLength?: number;
  partitionKeyLength?: number;
  parts?: number;
  partsWithStats?: number;
  rows?: number;
  bytes?: number;
  /**
   * Distinct values per axis, in the order the column declares its axes.
   *
   * Counted independently, so multiplying them gives an upper bound on the
   * distinct key tuples rather than their number: axes are usually correlated,
   * and a product invents combinations that never occur. Use `distinctKeys`
   * where the key in question is the whole tuple.
   */
  axisCardinality?: number[];
  /**
   * Distinct whole key tuples, which is exact where a join keys on every axis
   * the column has — the ordinary case for two columns sharing their key.
   */
  distinctKeys?: number;
  /** Set when the entries were too many to count distinct keys over. */
  axisCardinalityUncounted?: boolean;
};

export function summarizeData(data: unknown): DataSummary {
  if (data === null || data === undefined) return { kind: "absent" };
  if (Array.isArray(data)) {
    // Inline values, built inside the model sandbox.
    return {
      kind: "inline",
      entries: data.length,
      approxBytes: approxInlineBytes(data),
      ...inlineAxisCardinality(data),
    };
  }
  if (typeof data !== "object") return { kind: typeof data };

  const info = data as { type?: string; [key: string]: unknown };
  switch (info.type) {
    case "Json":
      return {
        kind: "Json",
        keyLength: numberOr(info.keyLength),
        entries: countKeys(info.data),
      };
    case "JsonPartitioned":
    case "BinaryPartitioned":
      return {
        kind: info.type,
        partitionKeyLength: numberOr(info.partitionKeyLength),
        parts: countKeys(info.parts),
      };
    case "ParquetPartitioned":
      return summarizeParquet(info);
    default:
      return { kind: info.type ?? opaqueKind(data) };
  }
}

// Internals

function summarizeParquet(info: { [key: string]: unknown }): DataSummary {
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
    partitionKeyLength: numberOr(info.partitionKeyLength),
    parts: parts.length,
    partsWithStats: withStats,
    rows: withStats > 0 ? rows : undefined,
    bytes: withStats > 0 ? bytes : undefined,
  };
}

/**
 * How many entries may be walked to count distinct axis keys.
 *
 * Counting is exact and needs a set per axis, so it costs memory in proportion
 * to the distinct keys it finds — which is the wrong thing to spend in the
 * situation this code exists to diagnose. Past the cap the count is declined
 * rather than approximated, so a number that is present is always true.
 */
const CARDINALITY_LIMIT = 100_000;

function inlineAxisCardinality(values: unknown[]): {
  axisCardinality?: number[];
  distinctKeys?: number;
  axisCardinalityUncounted?: boolean;
} {
  if (values.length > CARDINALITY_LIMIT) return { axisCardinalityUncounted: true };
  const firstKey = (values[0] as { key?: unknown } | undefined)?.key;
  if (!Array.isArray(firstKey)) return {};

  const perAxis = firstKey.map(() => new Set<unknown>());
  // Counted alongside the per-axis sets rather than derived from them: the two
  // are equal only when the axes vary independently, which they rarely do.
  const tuples = new Set<string>();
  for (const entry of values) {
    const key = (entry as { key?: unknown }).key;
    if (!Array.isArray(key) || key.length !== perAxis.length) return {};
    for (const [axis, value] of key.entries()) perAxis[axis].add(value);
    tuples.add(key.map((value) => String(value)).join("\u0000"));
  }
  return { axisCardinality: perAxis.map((set) => set.size), distinctKeys: tuples.size };
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

function numberOr(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function opaqueKind(value: object): string {
  return (value as { constructor?: { name?: string } }).constructor?.name ?? "opaque";
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
