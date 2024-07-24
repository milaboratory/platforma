import { z } from 'zod';
import { ContentAny, ManifestContentBinary } from './content_types';
import { ResolvedModuleFile, ResolvedModuleFolder } from './content_conversion';

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

export function BlockComponentsDescription(moduleRoot: string) {
  return BlockComponents(
    ResolvedModuleFile(moduleRoot),
    ResolvedModuleFolder(moduleRoot, 'index.html')
  );
}
export type BlockComponentsDescription = z.infer<ReturnType<typeof BlockComponentsDescription>>;

export const BlockComponentsManifest = BlockComponents(
  ManifestContentBinary,
  ManifestContentBinary
);
export type BlockComponentsManifest = z.infer<typeof BlockComponentsManifest>;
