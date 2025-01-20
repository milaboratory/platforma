import {
  BlockModel,
  extractFolderAndGetURL,
  getResourceField,
  ImportFileHandle,
  InferHrefType,
  InferOutputsType,
  MainOutputs,
} from '@platforma-sdk/model';
import { z } from 'zod';

export const ImportFileHandleSchema = z
  .string()
  .optional()
  .refine<ImportFileHandle | undefined>(
    ((a) => true) as (arg: string | undefined) => arg is ImportFileHandle | undefined
  );

export const BlockArgs = z.object({
  inputHandle: ImportFileHandleSchema
});

export type BlockArgs = z.infer<typeof BlockArgs>;

export const platforma = BlockModel.create('Heavy')

  .withArgs({
    inputHandle: undefined
  })

  .output('handle', (ctx) => ctx.outputs?.resolve('handle')?.getImportProgress())

  .output('tar_gz_content', extractFolderAndGetURL(getResourceField(MainOutputs, 'tar_gz_site'), 'tgz'))

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
