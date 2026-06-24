import path from "node:path";
import { tryLoadFile } from "../util";
import type { BlockPackDescriptionAbsolute } from "./model";
import {
  resolveBlockPackDescription,
  resolveManifestBlockComponents,
  resolveManifestBlockPackMeta,
} from "./model";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { notEmpty } from "@milaboratories/ts-helpers";
import fsp from "node:fs/promises";
import type { BlockPackDescriptionRaw, BlockPackId } from "@milaboratories/pl-model-middle-layer";
import {
  BlockPackDescriptionFromPackageJsonRaw,
  BlockPackManifest,
  BlockPackManifestFile,
  SemVer,
} from "@milaboratories/pl-model-middle-layer";

export const BlockDescriptionPackageJsonField = "block";

const ConventionPackageNamePattern =
  /(?:@[a-zA-Z0-9-.]+\/)?(?<organization>[a-zA-Z0-9-]+)\.(?<name>[a-zA-Z0-9-]+)/;

export function parsePackageName(packageName: string): Pick<BlockPackId, "organization" | "name"> {
  const match = packageName.match(ConventionPackageNamePattern);
  if (!match)
    throw new Error(
      `Malformed package name (${packageName}), can't infer organization and block pack name.`,
    );
  const { name, organization } = match.groups!;
  return { name, organization };
}

export async function tryLoadPackDescription(
  moduleRoot: string,
  logger?: MiLogger,
): Promise<BlockPackDescriptionAbsolute | undefined> {
  const fullPackageJsonPath = path.resolve(moduleRoot, "package.json");
  try {
    const packageJson = await tryLoadFile(
      fullPackageJsonPath,
      (buf) => JSON.parse(buf.toString("utf-8")) as Record<string, unknown>,
    );
    if (packageJson === undefined) return undefined;
    const descriptionNotParsed = packageJson[BlockDescriptionPackageJsonField];
    if (descriptionNotParsed === undefined) return undefined;
    const descriptionRaw = {
      ...BlockPackDescriptionFromPackageJsonRaw.parse(descriptionNotParsed),
      id: {
        ...parsePackageName(
          notEmpty(
            packageJson["name"] as string | undefined,
            `"name" not found in ${fullPackageJsonPath}`,
          ),
        ),
        version: SemVer.parse(packageJson["version"]),
      },
    };
    return await resolveBlockPackDescription(descriptionRaw, moduleRoot);
  } catch (e: unknown) {
    logger?.warn(e);
    return undefined;
  }
}

export async function loadPackDescriptionRaw(moduleRoot: string): Promise<BlockPackDescriptionRaw> {
  const fullPackageJsonPath = path.resolve(moduleRoot, "package.json");
  const packageJson = JSON.parse(
    await fsp.readFile(fullPackageJsonPath, { encoding: "utf-8" }),
  ) as Record<string, unknown>;
  const descriptionNotParsed = packageJson[BlockDescriptionPackageJsonField];
  if (descriptionNotParsed === undefined)
    throw new Error(
      `Block description (field ${BlockDescriptionPackageJsonField}) not found in ${fullPackageJsonPath}.`,
    );
  return {
    ...BlockPackDescriptionFromPackageJsonRaw.parse(descriptionNotParsed),
    id: {
      ...parsePackageName(
        notEmpty(
          packageJson["name"] as string | undefined,
          `"name" not found in ${fullPackageJsonPath}`,
        ),
      ),
      version: SemVer.parse(packageJson["version"]),
    },
    featureFlags: {},
  };
}

export async function loadPackDescription(
  moduleRoot: string,
): Promise<BlockPackDescriptionAbsolute> {
  const descriptionRaw = await loadPackDescriptionRaw(moduleRoot);
  return await resolveBlockPackDescription(descriptionRaw, moduleRoot);
}

/** Folder name (under a consumed package root) holding the v2 block-pack artifacts. */
export const BlockPackFolderName = "block-pack";

/**
 * Loads a block-pack description from a block-pack directory's `manifest.json`,
 * resolving every relative entry against that directory to an absolute
 * filesystem path. Takes the pack directory directly (the `from-pack-v2`
 * pointer's `pack` field) — the structurer owns the layout, so this does not
 * re-derive `<root>/block-pack`. Counterpart to `loadPackDescription`, which
 * reads the authoring `block` field from `package.json` and resolves against
 * source. Used only by the `from-pack-v2` loader.
 */
export async function loadPackDescriptionFromManifest(
  blockPackDir: string,
): Promise<BlockPackDescriptionAbsolute> {
  const manifestPath = path.resolve(blockPackDir, BlockPackManifestFile);
  const raw = JSON.parse(await fsp.readFile(manifestPath, { encoding: "utf-8" })) as unknown;
  const manifest = BlockPackManifest.parse(raw);
  const components = resolveManifestBlockComponents(manifest.description.components, blockPackDir);
  const meta = await resolveManifestBlockPackMeta(manifest.description.meta, blockPackDir);
  return {
    ...manifest.description,
    components,
    meta,
  };
}
