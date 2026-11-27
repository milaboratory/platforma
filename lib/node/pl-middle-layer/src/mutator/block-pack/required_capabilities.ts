import { gunzipSync } from "node:zlib";
import type { CompiledTemplateV3, TemplateData } from "@milaboratories/pl-model-backend";
import type { PlClient } from "@milaboratories/pl-client";

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

/** Throws when the connected backend doesn't advertise every capability the
 * block-pack requires (as declared in `meta.requiredCapabilities`).
 *
 * The matching set is the desktop's install gate moved server-side so both
 * the UI (`AddBlockModal`) and direct middle-layer callers (the MCP server's
 * `add_block` tool, programmatic block installs, tests) reject incompatible
 * blocks consistently. */
export function throwIfMissingServerCapabilities(
  pl: PlClient,
  requiredCapabilities: readonly string[] | undefined,
): void {
  if (!requiredCapabilities || requiredCapabilities.length === 0) return;
  const advertised = (pl.serverInfo.capabilities ?? []) as readonly string[];
  const filterFn = (c: string) => !advertised.includes(c);
  if (!requiredCapabilities.some(filterFn)) return;
  const missing = requiredCapabilities.filter(filterFn);
  throw new Error(
    `Block cannot be added: connected backend does not advertise capabilities ` +
      `${JSON.stringify(missing)}. ` +
      `Backend advertises ${JSON.stringify(advertised)}. ` +
      `Upgrade the backend or remove the requirement from the block manifest.`,
  );
}
