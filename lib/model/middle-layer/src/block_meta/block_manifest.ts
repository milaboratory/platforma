import * as v from "valibot";
import type { BlockComponents } from "./block_components";
import { WorkflowSchemaV1 } from "./block_components";
import { ContentRelative, ContentRelativeBinary, ContentRelativeText } from "./content_types";
import { CreateBlockPackDescriptionSchema } from "./block_description";
import { BlockPackMeta } from "./block_meta";
import { toMerged } from "es-toolkit";
import type { BlockPackId } from "./block_id";

export type BlockComponentsManifest = BlockComponents<ContentRelative, ContentRelative>;

/**
 * Block-components shape stored in a manifest. The consolidator always writes
 * the wrapped `{type: "workflow-v1", main: ...}` form, so the manifest schema
 * accepts the wrapped form only.
 */
export const BlockComponentsManifest = v.object({
  workflow: WorkflowSchemaV1(ContentRelative),
  model: ContentRelative,
  ui: ContentRelative,
}) satisfies v.GenericSchema<BlockComponentsManifest>;

export const BlockPackMetaManifest = BlockPackMeta(ContentRelativeText, ContentRelativeBinary);
export type BlockPackMetaManifest = v.InferOutput<typeof BlockPackMetaManifest>;

/** Block description to be used in block manifest */
export const BlockPackDescriptionManifest = CreateBlockPackDescriptionSchema(
  BlockComponentsManifest,
  BlockPackMetaManifest,
);
export type BlockPackDescriptionManifest = v.InferOutput<typeof BlockPackDescriptionManifest>;

export const Sha256Schema = v.pipe(
  v.string(),
  v.regex(/[0-9a-fA-F]/),
  v.toUpperCase(),
  v.length(64), // 256 / 4 (bits per hex register);
);

export const ManifestFileInfo = v.object({
  name: v.string(),
  size: v.pipe(v.number(), v.integer()),
  sha256: Sha256Schema,
});
export type ManifestFileInfo = v.InferOutput<typeof ManifestFileInfo>;

export const BlockPackManifest = v.looseObject({
  schema: v.literal("v2"),
  description: BlockPackDescriptionManifest,
  timestamp: v.optional(v.number()),
  files: v.array(ManifestFileInfo),
});
export type BlockPackManifest = v.InferOutput<typeof BlockPackManifest>;

export const BlockPackManifestFile = "manifest.json";

export function overrideManifestVersion<T extends { description: { id: BlockPackId } }>(
  manifest: T,
  newVersion: string,
): T {
  return toMerged(manifest, { description: { id: { version: newVersion } } }) as T;
}
