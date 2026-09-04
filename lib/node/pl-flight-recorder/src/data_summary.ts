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
};

export function summarizeData(data: unknown): DataSummary {
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
