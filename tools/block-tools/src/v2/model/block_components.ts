import { z } from 'zod';
import {
  ContentAbsoluteBinaryLocal,
  ContentAbsoluteFolder,
  ContentAny,
  ContentAnyBinaryLocal,
  ContentRelative,
  ContentRelativeBinary
} from './content_types';
import {
  ResolvedModuleFile,
  ResolvedModuleFolder,
  packFolderToRelativeTgz,
  cpAbsoluteToRelative,
  mapRemoteToAbsolute
} from './content_conversion';

export type BlockPackComponents = {};

export function Workflow<const Content extends z.ZodTypeAny>(contentType: Content) {
  return z.union([
    // string is converted to v1 workflow
    contentType.transform((value) => ({
      type: 'workflow-v1',
      main: value
    })),
    // structured objects are decoded as union with type descriptor
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('workflow-v1'),
        main: contentType.describe('Main workflow')
      })
    ])
  ]);
}

function BlockComponents<const WfAndModel extends z.ZodTypeAny, const UI extends z.ZodTypeAny>(
  wfAndModel: WfAndModel,
  ui: UI
) {
  return z.object({
    workflow: wfAndModel,
    model: wfAndModel,
    ui
  });
}

export const BlockComponentsDescriptionRaw = BlockComponents(z.string(), z.string());
export type BlockComponentsDescriptionRaw = z.infer<typeof BlockComponentsDescriptionRaw>;

export function BlockComponentsDescription(moduleRoot: string) {
  return BlockComponents(
    ResolvedModuleFile(moduleRoot),
    ResolvedModuleFolder(moduleRoot, 'index.html')
  );
}
export type BlockComponentsDescription = z.infer<ReturnType<typeof BlockComponentsDescription>>;

export function BlockComponentsConsolidate(dstFolder: string, fileAccumulator?: string[]) {
  return BlockComponents(
    ContentAbsoluteBinaryLocal.transform(cpAbsoluteToRelative(dstFolder, fileAccumulator)),
    ContentAbsoluteFolder.transform(packFolderToRelativeTgz(dstFolder, 'ui.tgz', fileAccumulator))
  ).pipe(BlockComponentsManifest);
}

export const BlockComponentsManifest = BlockComponents(ContentRelative, ContentRelative);
export type BlockComponentsManifest = z.infer<typeof BlockComponentsManifest>;

export function BlockComponentsAbsoluteUrl(prefix: string) {
  return BlockComponents(
    ContentRelativeBinary.transform(mapRemoteToAbsolute(prefix)),
    ContentRelativeBinary.transform(mapRemoteToAbsolute(prefix))
  );
}
export type BlockComponentsAbsolute = z.infer<ReturnType<typeof BlockComponentsAbsoluteUrl>>;
