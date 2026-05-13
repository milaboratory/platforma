import { gunzipSync } from "node:zlib";

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

/** Derives the list of backend capabilities a block requires by scanning the
 * workflow's compiled `main.plj.gz` for wasm sections. Returns `["wasm"]` if
 * any template (or nested sub-template) carries wasm bytes, else `undefined`.
 *
 * Bytes-driven so dev-v2 / from-registry-v2 / explicit installs all derive
 * the same answer regardless of what the source manifest says (dev blocks
 * have no pack-time-generated `requiredCapabilities` in their source
 * `package.json#block.meta`; only block-tools-built block-packs do).
 *
 * Called from:
 *   - mutator/block-pack/block_pack.ts (install path: throwIfMissingServerCapabilities)
 *   - block_registry/registry.ts (listing path: BlockPackOverview.meta.requiredCapabilities) */
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
  const pack = parsed as { type?: string; template?: unknown };
  if (pack.type !== "pl.tengo-template.v3") return undefined;
  return templateHasWasm(pack.template) ? ["wasm"] : undefined;
}
