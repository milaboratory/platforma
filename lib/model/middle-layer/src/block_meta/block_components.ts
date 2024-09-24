import { z } from 'zod';
import { ContentRelativeBinary } from './content_types';
import { mapRemoteToAbsolute } from './content_conversion';

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

export function BlockComponents<
  const WfAndModel extends z.ZodTypeAny,
  const UI extends z.ZodTypeAny
>(wfAndModel: WfAndModel, ui: UI) {
  return z.object({
    workflow: Workflow(wfAndModel),
    model: wfAndModel,
    ui
  });
}

export const BlockComponentsDescriptionRaw = BlockComponents(z.string(), z.string());
export type BlockComponentsDescriptionRaw = z.infer<typeof BlockComponentsDescriptionRaw>;

export function BlockComponentsAbsoluteUrl(prefix: string) {
  return BlockComponents(
    ContentRelativeBinary.transform(mapRemoteToAbsolute(prefix)),
    ContentRelativeBinary.transform(mapRemoteToAbsolute(prefix))
  );
}
export type BlockComponentsAbsolute = z.infer<ReturnType<typeof BlockComponentsAbsoluteUrl>>;
