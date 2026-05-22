import type {
  BlockPackDescription,
  BlockPackDescriptionManifest,
  BlockPackDescriptionRaw,
} from "@milaboratories/pl-model-middle-layer";
import { addPrefixToRelative } from "@milaboratories/pl-model-middle-layer";
import type { BlockConfigContainer } from "@milaboratories/pl-model-common";
import { extractConfigGeneric } from "@milaboratories/pl-model-common";
import fsp from "node:fs/promises";
import type { BlockComponentsDescription } from "./block_components";
import { consolidateBlockComponents, resolveBlockComponents } from "./block_components";
import type { BlockPackMetaDescription } from "./block_meta";
import { consolidateBlockPackMeta, resolveBlockPackMeta } from "./block_meta";

/** Resolved block-pack description — components + meta point at absolute file paths. */
export type BlockPackDescriptionAbsolute = BlockPackDescription<
  BlockComponentsDescription,
  BlockPackMetaDescription
>;

/**
 * Resolves a raw `package.json`-form block-pack description against the
 * module root: workflow/model/ui paths via node module resolution, text and
 * binary fields in `meta` via `mapLocalToAbsolute`. Reads the resolved model
 * file to extract feature flags from its `BlockConfigContainer`.
 */
export async function resolveBlockPackDescription(
  raw: BlockPackDescriptionRaw,
  root: string,
): Promise<BlockPackDescriptionAbsolute> {
  const components = resolveBlockComponents(raw.components, root);
  const meta = await resolveBlockPackMeta(raw.meta, root);
  const cfg = extractConfigGeneric(
    JSON.parse(await fsp.readFile(components.model.file, "utf-8")) as BlockConfigContainer,
  );
  return {
    ...raw,
    components,
    meta,
    featureFlags: cfg.featureFlags,
  };
}

/**
 * Consolidates absolute references in components and meta into `dstFolder`
 * (copying files and packing the UI as `ui.tgz`), returning the manifest
 * form with relative paths.
 */
export async function consolidateBlockPackDescription(
  description: BlockPackDescriptionAbsolute,
  dstFolder: string,
  fileAccumulator?: string[],
): Promise<BlockPackDescriptionManifest> {
  const components = await consolidateBlockComponents(
    description.components,
    dstFolder,
    fileAccumulator,
  );
  const meta = await consolidateBlockPackMeta(description.meta, dstFolder, fileAccumulator);
  return {
    ...description,
    components,
    meta,
  };
}

/**
 * Prefixes every relative-path field in a manifest description with the
 * given path prefix (components workflow/model/ui plus meta text/binary
 * fields).
 */
export function addRelativePathPrefix(
  manifest: BlockPackDescriptionManifest,
  prefix: string,
): BlockPackDescriptionManifest {
  const transformer = addPrefixToRelative(prefix);
  const meta = manifest.meta;
  const { logo: orgLogo, ...orgRest } = meta.organization;
  return {
    ...manifest,
    components: {
      workflow: {
        type: "workflow-v1",
        main: transformer(manifest.components.workflow.main),
      },
      model: transformer(manifest.components.model),
      ui: transformer(manifest.components.ui),
    },
    meta: {
      ...meta,
      organization: {
        ...orgRest,
        ...(orgLogo !== undefined ? { logo: transformer(orgLogo) } : {}),
      },
      ...(meta.longDescription !== undefined
        ? { longDescription: transformer(meta.longDescription) }
        : {}),
      ...(meta.changelog !== undefined ? { changelog: transformer(meta.changelog) } : {}),
      ...(meta.logo !== undefined ? { logo: transformer(meta.logo) } : {}),
    },
  };
}
