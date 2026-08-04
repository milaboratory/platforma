import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  BlockKindReference,
  BlockPackLocationReference,
} from "@milaboratories/pl-model-common";
import { parseBlockPackLocation } from "@milaboratories/pl-model-common";
import type { BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import type { BlockPackDescriptionAbsolute } from "@platforma-sdk/block-tools";
import { loadPackDescription, loadPackDescriptionFromManifest } from "@platforma-sdk/block-tools";
import type { LocationResolution } from "../model/template_resolve";

/**
 * Read the block a template entry's `location` points at.
 *
 * The filesystem half of {@link BlockPackProvider}, and the reason a project built from
 * locally developed blocks can be exported and applied without publishing anything. No
 * registry is involved and nothing is searched: the entry named a place.
 *
 * Only `file:` is served. The document's grammar admits any scheme so that a template
 * stays readable by a consumer that can fetch more than this one can, and an unknown
 * scheme is reported rather than treated as a missing block — "I cannot read this" and
 * "there is nothing there" send the reader to different places.
 */
export async function resolveBlockPackLocation(
  location: BlockPackLocationReference,
): Promise<LocationResolution> {
  if (parseBlockPackLocation(location).scheme !== "file") {
    return { ok: false, reason: "unsupported-scheme" };
  }

  // The value is a URL, never a path: `fileURLToPath` is what turns `%20` back into the
  // space that was in the folder name. Reading `pathname` directly would look right and
  // fail on any path with a space in it.
  const dir = fileURLToPath(location);

  const found = await readPackAt(dir);
  if (found === undefined) {
    return (await exists(dir))
      ? { ok: false, reason: "not-a-block" }
      : { ok: false, reason: "not-found" };
  }

  return { ok: true, spec: found.spec, title: found.description.meta.title, kind: found.kind };
}

/** One readable block pack: which spec addresses it, and what it declares. */
type FoundPack = {
  readonly spec: BlockPackSpec;
  readonly description: BlockPackDescriptionAbsolute;
  readonly kind: BlockKindReference | undefined;
};

/**
 * Identify what kind of block pack is at `dir`, by looking rather than by being told.
 *
 * Two layouts can sit behind one `location`, and they anchor differently — a packed
 * block at the folder holding its `manifest.json`, a source block at the folder holding
 * the `package.json` that names its components. The document deliberately records only
 * the URI, so the layout is established here, where the filesystem is: encoding it in
 * the file instead would freeze today's two shapes into the format, and a template
 * written last month would name a layout that has since moved.
 *
 * A packed layout is checked first because it is the more specific one: a facade
 * package's own folder holds `package.json` and, once packed, `block-pack/` beside it
 * — never `manifest.json` directly.
 *
 * When neither matches, the two conventional subfolders are tried. Those are the same
 * names the dev-block scanner probes, so a hand-written entry may name the block's own
 * folder rather than the package inside it. Export never emits these: it writes the
 * anchor the loader accepts, so there is nothing to guess on a round trip.
 */
async function readPackAt(dir: string): Promise<FoundPack | undefined> {
  const direct = await readPackExactlyAt(dir);
  if (direct !== undefined) return direct;

  for (const subfolder of ["block", "meta"]) {
    const nested = await readPackExactlyAt(path.join(dir, subfolder));
    if (nested !== undefined) return nested;
  }

  return undefined;
}

async function readPackExactlyAt(dir: string): Promise<FoundPack | undefined> {
  if (await exists(path.join(dir, "manifest.json"))) {
    const description = await loadPackDescriptionFromManifest(dir);
    return {
      // The pack directory is what the preparer expects to be handed, and it is where
      // the manifest was just read from — not something reconstructed from a parent.
      spec: { type: "from-pack-v2", packUrl: pathToFileURL(dir).href },
      description,
      kind: description.kind,
    };
  }

  if (await hasBlockDescription(path.join(dir, "package.json"))) {
    const description = await loadPackDescription(dir);
    return { spec: { type: "dev-v2", folder: dir }, description, kind: description.kind };
  }

  return undefined;
}

/**
 * Whether this `package.json` describes a block at all.
 *
 * Checked before handing the folder to the loader so that an ordinary npm package —
 * anything with a `package.json` and no block description — comes back as "not a
 * block" rather than as a thrown parse failure from inside the loader.
 */
async function hasBlockDescription(packageJsonPath: string): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await fsp.readFile(packageJsonPath, "utf-8"));
    return typeof parsed === "object" && parsed !== null && "block" in parsed;
  } catch {
    return false;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fsp.stat(target);
    return true;
  } catch {
    return false;
  }
}
