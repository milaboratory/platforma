import type {
  BlockPackMeta,
  BlockPackMetaDescriptionRaw,
  BlockPackMetaEmbeddedBase64,
  BlockPackMetaEmbeddedBytes,
  BlockPackMetaManifest,
  ContentAbsoluteBinaryLocal,
  ContentAbsoluteTextLocal,
} from "@milaboratories/pl-model-middle-layer";
import type { RelativeContentReader } from "./content_conversion";
import {
  absoluteToBase64,
  absoluteToBytes,
  absoluteToString,
  cpAbsoluteToRelative,
  mapLocalToAbsolute,
  relativeToContentString,
  relativeToExplicitBytes,
} from "./content_conversion";

/** Resolved BlockPackMeta — text/binary references mapped to absolute file refs. */
export type BlockPackMetaDescription = BlockPackMeta<
  ContentAbsoluteTextLocal,
  ContentAbsoluteBinaryLocal
>;

/**
 * Applies independent transforms to BlockPackMeta's text-content and
 * binary-content fields (`longDescription`, `changelog`, `logo`,
 * `organization.logo`). All other fields, including unknown passthrough keys,
 * pass through unchanged.
 */
async function transformBlockPackMeta<L1, B1, L2, B2>(
  meta: BlockPackMeta<L1, B1>,
  mapText: (value: L1) => Promise<L2>,
  mapBinary: (value: B1) => Promise<B2>,
): Promise<BlockPackMeta<L2, B2>> {
  const { organization } = meta;
  const { logo: orgLogo, ...orgRest } = organization;
  const out = {
    ...meta,
    organization: {
      ...orgRest,
      ...(orgLogo !== undefined ? { logo: await mapBinary(orgLogo) } : {}),
    },
    ...(meta.longDescription !== undefined
      ? { longDescription: await mapText(meta.longDescription) }
      : {}),
    ...(meta.changelog !== undefined ? { changelog: await mapText(meta.changelog) } : {}),
    ...(meta.logo !== undefined ? { logo: await mapBinary(meta.logo) } : {}),
  };
  return out as BlockPackMeta<L2, B2>;
}

/**
 * Resolves text/binary references in raw BlockPackMeta (post-`package.json`
 * normalization) to absolute file paths against the module root.
 */
export async function resolveBlockPackMeta(
  raw: BlockPackMetaDescriptionRaw,
  root: string,
): Promise<BlockPackMetaDescription> {
  const toAbs = mapLocalToAbsolute(root);
  return transformBlockPackMeta(
    raw,
    async (v) => toAbs(v),
    async (v) => toAbs(v),
  );
}

/**
 * Copies absolute text/binary file references into `dstFolder` and returns
 * the manifest form with relative paths.
 */
export async function consolidateBlockPackMeta(
  meta: BlockPackMetaDescription,
  dstFolder: string,
  fileAccumulator?: string[],
): Promise<BlockPackMetaManifest> {
  const cpToRel = cpAbsoluteToRelative(dstFolder, fileAccumulator);
  return transformBlockPackMeta(
    meta,
    async (v) => cpToRel(v),
    async (v) => cpToRel(v),
  ) as Promise<BlockPackMetaManifest>;
}

/**
 * Reads absolute file references and embeds the content as in-line strings
 * and base64-encoded binary blobs.
 */
export async function embedBlockPackMetaAbsoluteBase64(
  meta: BlockPackMetaDescription,
): Promise<BlockPackMetaEmbeddedBase64> {
  return transformBlockPackMeta(
    meta,
    absoluteToString(),
    absoluteToBase64(),
  ) as Promise<BlockPackMetaEmbeddedBase64>;
}

/**
 * Reads absolute file references and embeds the content as in-line strings
 * and raw byte arrays.
 */
export async function embedBlockPackMetaAbsoluteBytes(
  meta: BlockPackMetaDescription,
): Promise<BlockPackMetaEmbeddedBytes> {
  return transformBlockPackMeta(
    meta,
    absoluteToString(),
    absoluteToBytes(),
  ) as Promise<BlockPackMetaEmbeddedBytes>;
}

/**
 * Reads relative-path references through the given content reader and embeds
 * the content as in-line strings and raw byte arrays.
 */
export async function embedBlockPackMetaBytes(
  manifest: BlockPackMetaManifest,
  reader: RelativeContentReader,
): Promise<BlockPackMetaEmbeddedBytes> {
  return transformBlockPackMeta(
    manifest,
    relativeToContentString(reader),
    relativeToExplicitBytes(reader),
  ) as Promise<BlockPackMetaEmbeddedBytes>;
}
