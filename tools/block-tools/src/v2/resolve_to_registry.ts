import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  BlockPackDevV2,
  BlockPackFromPackV2,
  BlockPackFromRegistryV2,
  BlockPackId,
} from "@milaboratories/pl-model-middle-layer";

/** File written by `block-tools publish` into `block-pack/`, carrying the
 * registry coordinates of the published version. Holds only the immutable
 * coordinates (CDN serve URL + version id). No `channel`: channels are moving
 * pointers in the registry — a version can be promoted/moved later — so the
 * channel at publish time is transient state we can't pin here. Update-checking
 * resolves the channel at read time (`BlockPackFromRegistryV2.channel` is
 * optional; the watcher defaults stable → any). */
export const PublishedCoordsFileName = "published.json";

/** Registry coordinates persisted in `block-pack/published.json`. */
export interface PublishedCoords {
  /** CDN serve URL the block is fetched from (not the S3 upload bucket). */
  registryUrl: string;
  id: BlockPackId;
}

/**
 * Builds the `published.json` payload. Pure (no filesystem) so it is unit
 * testable.
 */
export function buildPublishedCoords(args: {
  registryUrl: string;
  id: BlockPackId;
}): PublishedCoords {
  return {
    registryUrl: args.registryUrl,
    id: args.id,
  };
}

/** Writes `block-pack/published.json` into the given block-pack folder. */
export async function writePublishedCoords(
  blockPackDir: string,
  coords: PublishedCoords,
): Promise<void> {
  const file = path.resolve(blockPackDir, PublishedCoordsFileName);
  await fsp.writeFile(file, JSON.stringify(coords, null, 2), { encoding: "utf-8" });
}

/**
 * Resolves a local block locator (`dev-v2` or `from-pack-v2`) to its registry
 * coordinates by reading `published.json`. `published.json` lives inside the
 * block-pack directory (written there by `block-tools publish`), so for
 * `from-pack-v2` we read it directly from `packUrl` (converted to a path at this
 * Node boundary) — the structurer owns the layout, we do not re-derive it. For a
 * `dev-v2` block folder it sits under
 * `<folder>/block-pack/`. The facade's engine-generated `from-pack-v2`
 * BlockPointer feeds this so a consumed block can be installed via the registry
 * path. Throws when the block was never published.
 */
export async function resolveToRegistry(
  locator: BlockPackDevV2 | BlockPackFromPackV2,
): Promise<BlockPackFromRegistryV2> {
  const file =
    locator.type === "from-pack-v2"
      ? path.resolve(fileURLToPath(locator.packUrl), PublishedCoordsFileName)
      : path.resolve(locator.folder, "block-pack", PublishedCoordsFileName);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Block has no ${PublishedCoordsFileName} at ${file} — ` +
        `was the block published? Run block-tools publish before consuming via registry.`,
    );
  }
  const raw = JSON.parse(await fsp.readFile(file, { encoding: "utf-8" })) as {
    registryUrl: string;
    id: BlockPackFromRegistryV2["id"];
  };
  return {
    type: "from-registry-v2",
    registryUrl: raw.registryUrl,
    id: raw.id,
  };
}
