import { z } from "zod";
import { BlockPackId } from "../block_meta";

/** Block pack from local folder, to be used during block development. Old layout.
 * @deprecated don't use */
export const BlockPackDevV1 = z.object({
  type: z.literal("dev-v1"),
  folder: z.string(),
  mtime: z.string().optional(),
});
/** @deprecated don't use */
export type BlockPackDevV1 = z.infer<typeof BlockPackDevV1>;

/** Block pack from local folder, to be used during block development. New layout. */
export const BlockPackDevV2 = z.object({
  type: z.literal("dev-v2"),
  folder: z.string(),
  mtime: z.string().optional(),
});
export type BlockPackDevV2 = z.infer<typeof BlockPackDevV2>;

/** Block pack consumed from an npm-installed package's `block-pack/` folder
 * (manifest + ui.tgz). Emitted by the facade's engine-generated BlockPointer.
 * Self-describes its pack location (`packUrl`, `rootUrl`) rather than carrying
 * `dev-v2`'s `folder`. */
export const BlockPackFromPackV2 = z.object({
  type: z.literal("from-pack-v2"),
  /** `file:` URL of the block-pack directory itself — it directly contains
   * `manifest.json`, `ui.tgz`, `model.json`, `published.json`, … This is a URL,
   * NOT a filesystem path: the facade emits a lossless OS-agnostic locator and
   * stays dependency-free; each consumer converts at its own edge with
   * `fileURLToPath` (in Node). Consumers MUST read artifacts from here and MUST
   * NOT reconstruct `<root>/block-pack`: the pointer travels with the block at
   * its build-time SDK version, and a consumer at a different version cannot
   * know a layout the structurer may relocate. `type` versions the within-pack
   * format — if that changes, the discriminator bumps (`from-pack-v3`). */
  packUrl: z.string(),
  /** `file:` URL of the facade/package root — the parent that holds the pack
   * directory plus root-level siblings (e.g. `package.json`). A URL, not a path
   * (convert with `fileURLToPath` at the edge). Always emitted when built from a
   * block; optional because a future bare block-pack may ship with no root. */
  rootUrl: z.string().optional(),
  mtime: z.string().optional(),
});
export type BlockPackFromPackV2 = z.infer<typeof BlockPackFromPackV2>;

/**
 * Block pack from registry with version 2 layout, to be loaded directly
 * from the client.
 * @deprecated don't use
 * */
export const BlockPackFromRegistryV1 = z.object({
  type: z.literal("from-registry-v1"),
  registryUrl: z.string(),
  id: BlockPackId,
});
/** @deprecated don't use */
export type BlockPackFromRegistryV1 = z.infer<typeof BlockPackFromRegistryV1>;

/** Block pack from registry with version 2 layout, to be loaded directly
 * from the client. */
export const BlockPackFromRegistryV2 = z.object({
  type: z.literal("from-registry-v2"),
  registryUrl: z.string(),
  id: BlockPackId,
  channel: z.string().optional(),
});
export type BlockPackFromRegistryV2 = z.infer<typeof BlockPackFromRegistryV2>;

/** Information about block origin, can be used to instantiate new blocks */
export const BlockPackSpec = z.discriminatedUnion("type", [
  BlockPackDevV1,
  BlockPackDevV2,
  BlockPackFromPackV2,
  BlockPackFromRegistryV1,
  BlockPackFromRegistryV2,
]);
export type BlockPackSpec = z.infer<typeof BlockPackSpec>;
