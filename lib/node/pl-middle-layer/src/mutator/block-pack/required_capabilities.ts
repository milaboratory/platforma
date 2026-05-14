import { gunzipSync } from "node:zlib";
import type { CompiledTemplateV3, TemplateData } from "@milaboratories/pl-model-backend";

/** Walks a parsed v3 template tree and returns true if any node carries a
 * non-empty `wasm` map. Mirrors the build-time check in block-tools' pack
 * (templateHasWasm in tools/block-tools/src/v2/build_dist.ts) so install
 * time, listing time, and pack time stay in sync.
 * Why do we need this code duplication?
 * Only for development cycle. Block developer won't call do-pack on every
 * workflow change, so manifest.json won't be populated with 'wasm'
 * capability.
 * */
function templateHasWasm(tpl: unknown): boolean {
  if (tpl === null || typeof tpl !== "object") return false;
  const node = tpl as { wasm?: Record<string, unknown>; templates?: Record<string, unknown> };
  if (node.wasm && Object.keys(node.wasm).length > 0) return true;
  for (const sub of Object.values(node.templates ?? {})) {
    if (templateHasWasm(sub)) return true;
  }
  return false;
}

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
