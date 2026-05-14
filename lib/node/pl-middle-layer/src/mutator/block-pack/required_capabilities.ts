import { gunzipSync } from "node:zlib";
import type { CompiledTemplateV3, TemplateData } from "@milaboratories/pl-model-backend";
import { templateHasWasm } from "@milaboratories/pl-model-backend";

// `templateHasWasm` is the single source of truth for "does this template
// require wasm?", shared with block-tools' pack-time detection so that
// pack/install/listing-time derivations cannot silently diverge after a
// template-format change.

/** Derives required capabilities from an already-parsed template tree.
 *
 * Use this on the install path: `BlockPackPreparer.prepare` parses the
 * workflow off-thread via the worker, and the parsed result feeds straight
 * into this function — no second gunzip+JSON.parse on the main thread.
 *
 * Returns `["wasm:v1"]` if the v3 tree carries any wasm sections, else
 * `undefined`. v2 templates have no wasm field and always return
 * `undefined`. The token follows the backend's `<feature>:<version>`
 * capability format (see `server_capabilities.go`). */
export function requiredCapabilitiesFromTemplate(
  parsed: TemplateData | CompiledTemplateV3,
): string[] | undefined {
  if (parsed.type !== "pl.tengo-template.v3") return undefined;
  return templateHasWasm(parsed.template) ? ["wasm:v1"] : undefined;
}

/** Same derivation, starting from raw `main.plj.gz` bytes.
 *
 * Used only at catalog-listing time for local-dev blocks where the worker
 * pipeline isn't in play (block_registry/registry.ts). Install paths go
 * through `requiredCapabilitiesFromTemplate` instead to avoid parsing the
 * workflow twice.
 *
 * Bytes-driven so dev-v2 / from-registry-v2 / explicit installs all derive
 * the same answer regardless of what the source manifest says (dev blocks
 * have no pack-time-generated `requiredCapabilities` in their source
 * `package.json#block.meta`; only block-tools-built block-packs do). */
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
