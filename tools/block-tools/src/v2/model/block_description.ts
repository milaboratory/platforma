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
 * file to extract feature flags and the kind reference from its
 * `BlockConfigContainer`.
 *
 * Both of those come from the built model rather than from `package.json`,
 * because both are decided when the model is compiled. Carrying the kind here
 * means a description means the same thing whichever side it was loaded from —
 * a manifest already records it, and a caller should not have to know that a
 * source package does not and re-read the model to find out.
 */
export async function resolveBlockPackDescription(
  raw: BlockPackDescriptionRaw,
  root: string,
): Promise<BlockPackDescriptionAbsolute> {
  const components = resolveBlockComponents(raw.components, root);
  const meta = await resolveBlockPackMeta(raw.meta, root);
  const container = JSON.parse(
    await fsp.readFile(components.model.file, "utf-8"),
  ) as BlockConfigContainer;
  const cfg = extractConfigGeneric(container);
  return {
    ...raw,
    components,
    meta,
    featureFlags: cfg.featureFlags,
    // The kind sits at the container level, above the render envelope, so it
    // survives `extractConfigGeneric` normalizing that envelope away.
    ...(container.kind !== undefined ? { kind: container.kind } : {}),
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
 * Maps `components` and `meta` of a `BlockPackDescription` independently,
 * preserving every other top-level field (including the `BlockPackId` and
 * any passthrough siblings). Sync counterpart to the schema-driven async
 * pipelines in `block_meta.ts`/`block_components.ts`; used by callers that
 * need a synchronous transform (e.g. relative-path rewriting).
 */
function transformBlockPackDescription<Cin, Min, Cout, Mout>(
  description: BlockPackDescription<Cin, Min>,
  mapComponents: (components: Cin) => Cout,
  mapMeta: (meta: Min) => Mout,
): BlockPackDescription<Cout, Mout> {
  return {
    ...description,
    components: mapComponents(description.components),
    meta: mapMeta(description.meta),
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
  return transformBlockPackDescription(
    manifest,
    (components) => ({
      workflow: {
        type: "workflow-v1",
        main: transformer(components.workflow.main),
      },
      model: transformer(components.model),
      ui: transformer(components.ui),
    }),
    (meta) => {
      const { logo: orgLogo, ...orgRest } = meta.organization;
      return {
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
      };
    },
  );
}
