import type {
  BlockPackDescriptionManifest,
  ManifestFileInfo,
} from "@milaboratories/pl-model-middle-layer";
import { BlockPackManifest, BlockPackManifestFile } from "@milaboratories/pl-model-middle-layer";
import type { BlockPackDescriptionAbsolute } from "./model";
import { BlockPackDescriptionConsolidateToFolder } from "./model";
import fsp from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { calculateSha256 } from "../util";

/**
 * templateHasWasm walks a parsed v3 template tree (or any nested fragment)
 * and returns true if any node carries a non-empty `wasm` map. Recursion
 * descends into `templates` so transitively-imported sub-templates with
 * wasm dependencies are detected too.
 *
 * Exposed for unit tests; not part of the public block-tools API.
 */
export function templateHasWasm(tpl: unknown): boolean {
  if (tpl === null || typeof tpl !== "object") return false;
  const node = tpl as { wasm?: Record<string, unknown>; templates?: Record<string, unknown> };
  if (node.wasm && Object.keys(node.wasm).length > 0) return true;
  for (const sub of Object.values(node.templates ?? {})) {
    if (templateHasWasm(sub)) return true;
  }
  return false;
}

/**
 * workflowUsesWasm reads the workflow's compiled `main.plj.gz` (already
 * consolidated under `dst`) and returns true if its template tree carries
 * any wasm sections. Returns false for v2 packs (which have no wasm field)
 * and for malformed packs — fail-safe because the worst case is "block
 * installs anywhere" which is the pre-WASM status quo.
 */
async function workflowUsesWasm(
  descriptionRelative: BlockPackDescriptionManifest,
  dst: string,
): Promise<boolean> {
  // After BlockPackDescriptionConsolidateToFolder runs, components.workflow.main
  // is always a {type: "relative", path: ...} reference into dst.
  const main = descriptionRelative.components.workflow.main;
  const bytes = await fsp.readFile(path.resolve(dst, main.path));

  let parsed: unknown;
  try {
    const json = gunzipSync(bytes).toString("utf-8");
    parsed = JSON.parse(json);
  } catch {
    return false;
  }

  const pack = parsed as { type?: string; template?: unknown };
  if (pack.type !== "pl.tengo-template.v3") return false;
  return templateHasWasm(pack.template);
}

export async function buildBlockPackDist(
  description: BlockPackDescriptionAbsolute,
  dst: string,
): Promise<BlockPackManifest> {
  await fsp.mkdir(dst, { recursive: true });
  const files: string[] = [];
  const descriptionRelative: BlockPackDescriptionManifest =
    await BlockPackDescriptionConsolidateToFolder(dst, files).parseAsync(description);

  // Per-block WASM-requirement detection: inspect the consolidated workflow
  // `main.plj.gz` for actual wasm sections instead of stamping every block
  // built with this SDK release. Blocks whose workflow doesn't reach a
  // WASM-backed SDK lib install on any backend; only blocks that do force
  // the customer to run a wasm-capable backend.
  //
  // See docs/text/work/projects/webassembly-libraries-tengo/README.md,
  // "Capability declaration: detected from main.plj.gz, not the SDK release"
  // for the rationale.
  if (await workflowUsesWasm(descriptionRelative, dst)) {
    descriptionRelative.meta = {
      ...descriptionRelative.meta,
      // Capability tokens follow the backend's "<feature>:<version>" format
      // (see core/pl/platform/api/plapiserver/server_capabilities.go). Bump
      // to wasm:v2 if the wasm wire contract becomes backward-incompatible.
      requiredCapabilities: ["wasm:v1"],
    };
  }

  const filesForManifest = await Promise.all(
    files.map(async (f): Promise<ManifestFileInfo> => {
      const bytes = await fsp.readFile(path.resolve(dst, f));
      const sha256 = await calculateSha256(bytes);
      return { name: f, size: bytes.length, sha256 };
    }),
  );

  const manifest: BlockPackManifest = BlockPackManifest.parse({
    schema: "v2",
    description: {
      ...descriptionRelative,
    },
    files: filesForManifest,
    timestamp: Date.now(),
  } satisfies BlockPackManifest);
  await fsp.writeFile(path.resolve(dst, BlockPackManifestFile), JSON.stringify(manifest));
  return manifest;
}
