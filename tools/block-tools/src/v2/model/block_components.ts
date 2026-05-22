import type {
  BlockComponents,
  BlockComponentsDescriptionRaw,
  BlockComponentsManifest,
  ContentAbsoluteFile,
  ContentAbsoluteFolder,
  ContentAbsoluteUrl,
} from "@milaboratories/pl-model-middle-layer";
import { mapRemoteToAbsolute } from "@milaboratories/pl-model-middle-layer";
import {
  cpAbsoluteToRelative,
  packFolderToRelativeTgz,
  resolveModuleFile,
  resolveModuleFolder,
} from "./content_conversion";

/**
 * Resolved BlockComponents — workflow main and model resolved to absolute
 * file references, UI request resolved to its absolute folder.
 */
export type BlockComponentsDescription = BlockComponents<
  ContentAbsoluteFile,
  ContentAbsoluteFolder
>;

/** BlockComponents pointing at registry-served URLs. */
export type BlockComponentsAbsoluteUrl = BlockComponents<ContentAbsoluteUrl, ContentAbsoluteUrl>;

/**
 * Resolves block-components paths from `package.json` raw form against the
 * module root. Workflow and model strings are resolved via node module
 * resolution; the UI request resolves to a folder containing `index.html`.
 */
export function resolveBlockComponents(
  raw: BlockComponentsDescriptionRaw,
  moduleRoot: string,
): BlockComponentsDescription {
  return {
    workflow: {
      type: "workflow-v1",
      main: resolveModuleFile(moduleRoot, raw.workflow.main),
    },
    model: resolveModuleFile(moduleRoot, raw.model),
    ui: resolveModuleFolder(moduleRoot, raw.ui, ["index.html"]),
  };
}

/**
 * Copies file references for workflow and model into `dstFolder`, packs the
 * UI folder into `ui.tgz`, returning the manifest form with relative paths.
 */
export async function consolidateBlockComponents(
  description: BlockComponentsDescription,
  dstFolder: string,
  fileAccumulator?: string[],
): Promise<BlockComponentsManifest> {
  const cpToRel = cpAbsoluteToRelative(dstFolder, fileAccumulator);
  const packToTgz = packFolderToRelativeTgz(dstFolder, "ui.tgz", fileAccumulator);
  return {
    workflow: {
      type: "workflow-v1",
      main: await cpToRel(description.workflow.main),
    },
    model: await cpToRel(description.model),
    ui: await packToTgz(description.ui),
  };
}

/**
 * Maps a manifest with relative paths to one with absolute URLs against the
 * given prefix. Used by the registry reader to point components at registry
 * storage.
 */
export function blockComponentsManifestToAbsoluteUrl(
  manifest: BlockComponentsManifest,
  prefix: string,
): BlockComponentsAbsoluteUrl {
  const toAbs = mapRemoteToAbsolute(prefix);
  return {
    workflow: {
      type: "workflow-v1",
      main: toAbs(manifest.workflow.main),
    },
    model: toAbs(manifest.model),
    ui: toAbs(manifest.ui),
  };
}
