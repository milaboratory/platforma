import { redact, type RedactionStats } from "./redact";

/**
 * What a definition record carries.
 *
 * The definition is recorded structurally (see `redact`) rather than through a
 * hand-written digest per definition type. Structural rules are not run here:
 * they belong to the analyzer, so nothing is computed on the hot path and the
 * rules can be revised against logs that already exist.
 */

export const REDACTION = {
  kept: [
    "definition shape",
    "column and axis names",
    "value types",
    "axis domains",
    "filter operators",
    "row, byte and partition counts",
  ],
  hashed: ["filter reference values", "annotation values", "column ids", "every other string"],
  dropped: ["cell values", "inline column payloads", "partition keys"],
} as const;

export type DefKind = "PTableDef" | "PTableDefV2" | "PFrameDef";

export type DefDigest = {
  kind: DefKind;
  /** Redacted definition, same shape as the original. */
  def: unknown;
  redaction: RedactionStats & { bytes: number };
};

/** Records one definition: redacted, measured, and tagged with its API shape. */
export function digestDef(kind: DefKind, def: unknown): DefDigest {
  const { value, stats } = redact(def);
  const json = safeLength(value);
  return { kind, def: value, redaction: { ...stats, bytes: json } };
}

// Internals

function safeLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}
