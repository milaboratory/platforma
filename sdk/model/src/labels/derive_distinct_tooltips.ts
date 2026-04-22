import {
  Annotation,
  PObjectId,
  readAnnotation,
  type AxisQualification,
  type PColumnSpec,
} from "@milaboratories/pl-model-common";
import { isNil } from "es-toolkit";
import type { MatchQualifications, MatchVariant } from "../columns";

export type TooltipEntry = {
  /** Main column spec — used for column-name fallback when no label. */
  spec: PColumnSpec;
  /** Full qualifications carried by this variant. */
  qualifications?: MatchQualifications;
  /** Minimal qualifications that separate this variant from its siblings. */
  distinctiveQualifications?: MatchQualifications;
  /** Linker steps traversed to reach the hit column. */
  linkerPath?: MatchVariant["path"];
  /** Position of this variant within the same physical column (1-based). */
  variantIndex?: number;
  /** Total variants for the same physical column. */
  variantCount?: number;
};

/** Format tooltip strings for each entry. Returns `undefined` when nothing useful. */
export function deriveDistinctTooltips(entries: TooltipEntry[]): (undefined | string)[] {
  return entries.map(formatTooltip);
}

function formatTooltip(entry: TooltipEntry): undefined | string {
  const sections: string[] = [];

  const header = formatHeader(entry);
  if (header !== undefined) sections.push(header);

  const origin = formatOriginPath(entry);
  if (origin !== undefined) sections.push(origin);

  const anchors = formatAnchors(entry.qualifications);
  if (anchors !== undefined) sections.push(anchors);

  const hit = formatHit(entry.qualifications);
  if (hit !== undefined) sections.push(hit);

  const distinctive = formatDistinctive(entry.distinctiveQualifications);
  if (distinctive !== undefined) sections.push(distinctive);

  if (sections.length <= 1) return undefined;
  return sections.join("\n\n");
}

function formatHeader(entry: TooltipEntry): undefined | string {
  const name = readAnnotation(entry.spec, Annotation.Label)?.trim() ?? entry.spec.name;
  const lines: string[] = [`Column: ${name}`];
  if (entry.variantCount !== undefined && entry.variantCount > 1) {
    lines.push(`Variant: ${entry.variantIndex ?? "?"} of ${entry.variantCount}`);
  }
  return lines.join("\n");
}

function formatOriginPath(entry: TooltipEntry): undefined | string {
  const path = entry.linkerPath ?? [];
  if (path.length === 0) return undefined;

  const lines = ["Origin path"];
  path.forEach((step, i) => {
    const label =
      readAnnotation(step.linker.spec, Annotation.LinkLabel) ??
      readAnnotation(step.linker.spec, Annotation.Label) ??
      step.linker.spec.name;
    lines.push(`  • linker ${i + 1}: ${label}`);
    const qs = formatAxisQualifications(step.qualifications);
    if (qs !== undefined) lines.push(`      qualifies: ${qs}`);
  });
  const hitName = readAnnotation(entry.spec, Annotation.Label) ?? entry.spec.name;
  lines.push(`  • hit column: ${hitName}`);
  return lines.join("\n");
}

function formatAnchors(q: undefined | MatchQualifications): undefined | string {
  if (isNil(q)) return undefined;
  const keys = Object.keys(q.forQueries);
  if (keys.length === 0) return undefined;

  const lines = ["Anchors (bound via this variant)"];
  for (const key of keys) {
    const axisQs = q.forQueries[key as PObjectId];
    const rendered = formatAxisQualifications(axisQs);
    lines.push(`  • ${key}${rendered !== undefined ? `   ${rendered}` : ""}`);
  }
  return lines.join("\n");
}

function formatHit(q: undefined | MatchQualifications): undefined | string {
  if (isNil(q) || q.forHit.length === 0) return undefined;
  const rendered = formatAxisQualifications(q.forHit);
  if (rendered === undefined) return undefined;
  return ["Hit column qualifications", `  • ${rendered}`].join("\n");
}

function formatDistinctive(q: undefined | MatchQualifications): undefined | string {
  if (isNil(q)) return undefined;
  const bullets: string[] = [];
  for (const key of Object.keys(q.forQueries)) {
    for (const item of q.forQueries[key as PObjectId])
      bullets.push(`  • ${key}: ${formatOneQualification(item)}`);
  }
  for (const item of q.forHit) bullets.push(`  • hit: ${formatOneQualification(item)}`);
  if (bullets.length === 0) return undefined;
  return ["Distinctive (what separates this variant)", ...bullets].join("\n");
}

function formatAxisQualifications(qs: AxisQualification[]): undefined | string {
  if (qs.length === 0) return undefined;
  return qs.map(formatOneQualification).join("; ");
}

function formatOneQualification(q: AxisQualification): string {
  const axisName = typeof q.axis === "string" ? q.axis : (q.axis.name ?? JSON.stringify(q.axis));
  const entries = Object.entries(q.contextDomain);
  if (entries.length === 0) return axisName;
  const kv = entries.map(([k, v]) => `${k}=${v}`).join(", ");
  return `${axisName} context: ${kv}`;
}
