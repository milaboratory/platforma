import type {
  BlockPackDescriptionManifest,
  ManifestFileInfo,
} from "@milaboratories/pl-model-middle-layer";
import { BlockPackManifest, BlockPackManifestFile } from "@milaboratories/pl-model-middle-layer";
import type { CompiledTemplateV3 } from "@milaboratories/pl-model-backend";
import type { BlockPackDescriptionAbsolute } from "./model";
import { consolidateBlockPackDescription } from "./model";
import fsp from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { calculateSha256 } from "../util";

/**
 * Returns the capability tokens the workflow's compiled template declares
 * it needs (via `TemplateDataV3.requiredCapabilities`, populated by
 * tengo-builder at compile time). Returns `undefined` for v2 packs, for
 * malformed packs, or when the template carries no requirements — fail-
 * safe so the worst case is "block installs anywhere", the pre-WASM
 * status quo.
 */
async function workflowRequiredCapabilities(
  descriptionRelative: BlockPackDescriptionManifest,
  dst: string,
): Promise<string[] | undefined> {
  // After consolidateBlockPackDescription runs, components.workflow.main is
  // always a `{type: "relative", path: ...}` reference into `dst`.
  const main = descriptionRelative.components.workflow.main;
  const bytes = await fsp.readFile(path.resolve(dst, main.path));

  let parsed: unknown;
  try {
    const json = gunzipSync(bytes).toString("utf-8");
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }

  const pack = parsed as Partial<CompiledTemplateV3>;
  if (pack.type !== "pl.tengo-template.v3" || !pack.template) return undefined;
  return pack.template.requiredCapabilities;
}

export async function buildBlockPackDist(
  description: BlockPackDescriptionAbsolute,
  dst: string,
): Promise<BlockPackManifest> {
  await fsp.mkdir(dst, { recursive: true });
  const files: string[] = [];
  const descriptionRelative: BlockPackDescriptionManifest = await consolidateBlockPackDescription(
    description,
    dst,
    files,
  );

  // Per-block capability detection: mirror the workflow's
  // compile-time-computed `requiredCapabilities` onto the published
  // manifest meta, so only blocks that actually need a feature force the
  // customer to run a backend advertising it. Tengo-builder is the
  // source of truth here — it populates the field when it embeds wasm
  // bytes (or any future feature artifact); block-tools just propagates
  // upward.
  //
  // See docs/text/work/projects/webassembly-libraries-tengo/README.md,
  // "Capability declaration: detected from main.plj.gz, not the SDK release".
  const workflowCapabilities = await workflowRequiredCapabilities(descriptionRelative, dst);
  if (workflowCapabilities && workflowCapabilities.length > 0) {
    descriptionRelative.meta = {
      ...descriptionRelative.meta,
      requiredCapabilities: workflowCapabilities,
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
