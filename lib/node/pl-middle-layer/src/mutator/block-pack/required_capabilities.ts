import { gunzipSync } from "node:zlib";
import type { CompiledTemplateV3, TemplateData } from "@milaboratories/pl-model-backend";

/**
 * Reads the capability tokens a template declares it requires via
 * `TemplateDataV3.requiredCapabilities` (populated by `tengo-builder` at
 * compile time).
 *
 * Use this on the install path: `BlockPackPreparer.prepare` parses the
 * workflow off-thread via the worker, and the parsed result feeds
 * straight into this function — no second gunzip+JSON.parse on the main
 * thread, no recursive walk to re-derive what the compiler already wrote
 * down.
 *
 * Returns `undefined` for v2 templates (no compile-time capability
 * field) and for v3 templates that declare no requirements; otherwise
 * the array as the compiler wrote it.
 */
export function requiredCapabilitiesFromTemplate(
  parsed: TemplateData | CompiledTemplateV3,
): string[] | undefined {
  if (parsed.type !== "pl.tengo-template.v3") return undefined;
  return parsed.template.requiredCapabilities;
}

/**
 * Same lookup, starting from raw `main.plj.gz` bytes. Used only at
 * catalog-listing time for local-dev blocks where the worker pipeline
 * isn't in play (`block_registry/registry.ts`). Install paths go through
 * `requiredCapabilitiesFromTemplate` instead to avoid parsing the
 * workflow twice.
 */
export function deriveRequiredCapabilities(
  workflowContent: Uint8Array | Buffer,
): string[] | undefined {
  let parsed: unknown;
  try {
    const json = gunzipSync(workflowContent).toString("utf-8");
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  return requiredCapabilitiesFromTemplate(parsed as TemplateData | CompiledTemplateV3);
}
