import { z } from 'zod';
import {
  ResolvedModuleFile,
  ResolvedModuleFolder,
  packFolderToRelativeTgz,
  cpAbsoluteToRelative,
  mapRemoteToAbsolute,
} from './content_conversion';
import { BlockComponents, BlockComponentsManifest, ContentAbsoluteBinaryLocal, ContentAbsoluteFolder, ContentRelativeBinary } from '@milaboratories/pl-model-middle-layer';

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

export function BlockComponentsAbsoluteUrl(prefix: string) {
  return BlockComponents(
    ContentRelativeBinary.transform(mapRemoteToAbsolute(prefix)),
    ContentRelativeBinary.transform(mapRemoteToAbsolute(prefix))
  );
}
export type BlockComponentsAbsolute = z.infer<ReturnType<typeof BlockComponentsAbsoluteUrl>>;