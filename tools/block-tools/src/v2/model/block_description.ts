import {
  addPrefixToRelative,
  BlockComponents,
  BlockPackDescriptionManifest,
  BlockPackMeta,
  ContentRelative,
  ContentRelativeBinary,
  ContentRelativeText,
  CreateBlockPackDescriptionSchema,
} from "@milaboratories/pl-model-middle-layer";
import { BlockComponentsConsolidate, BlockComponentsDescription } from "./block_components";
import { BlockPackMetaConsolidate, BlockPackMetaDescription } from "./block_meta";
import type { z } from "zod";
import fsp from "node:fs/promises";
import type { BlockConfigContainer } from "@milaboratories/pl-model-common";
import { extractConfigGeneric } from "@milaboratories/pl-model-common";

export function ResolvedBlockPackDescriptionFromPackageJson(root: string) {
  return CreateBlockPackDescriptionSchema(
    BlockComponentsDescription(root),
    BlockPackMetaDescription(root),
  ).transform(async (description, _ctx) => {
    const cfg = extractConfigGeneric(
      JSON.parse(
        await fsp.readFile(description.components.model.file, "utf-8"),
      ) as BlockConfigContainer,
    );
    const featureFlags = cfg.featureFlags;
    return {
      ...description,
      featureFlags,
    };
  });
}
export type BlockPackDescriptionAbsolute = z.infer<
  ReturnType<typeof ResolvedBlockPackDescriptionFromPackageJson>
>;

export function BlockPackDescriptionConsolidateToFolder(
  dstFolder: string,
  fileAccumulator?: string[],
) {
  return CreateBlockPackDescriptionSchema(
    BlockComponentsConsolidate(dstFolder, fileAccumulator),
    BlockPackMetaConsolidate(dstFolder, fileAccumulator),
  ).pipe(BlockPackDescriptionManifest);
}

export function BlockPackDescriptionManifestAddRelativePathPrefix(prefix: string) {
  const transformer = addPrefixToRelative(prefix);
  return BlockPackDescriptionManifest.pipe(
    CreateBlockPackDescriptionSchema(
      BlockComponents(
        ContentRelative.transform(transformer),
        ContentRelative.transform(transformer),
      ),
      BlockPackMeta(
        ContentRelativeText.transform(transformer),
        ContentRelativeBinary.transform(transformer),
      ),
    ),
  ).pipe(BlockPackDescriptionManifest);
}
