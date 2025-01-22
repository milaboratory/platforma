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
  inputTgzHandle: ImportFileHandleSchema,
  inputZipHandle: ImportFileHandleSchema
});

export type BlockArgs = z.infer<typeof BlockArgs>;

export const platforma = BlockModel.create('Heavy')

  .withArgs({
    inputTgzHandle: undefined,
    inputZipHandle: undefined
  })

  .output('handleTgz', (ctx) => ctx.outputs?.resolve('handleTgz')?.getImportProgress())
  .output('handleZip', (ctx) => ctx.outputs?.resolve('handleZip')?.getImportProgress())

  .output('tgz_content', extractFolderAndGetURL(getResourceField(MainOutputs, 'siteTgz'), 'tgz'))
  .output('zip_content', extractFolderAndGetURL(getResourceField(MainOutputs, 'siteZip'), 'zip'))

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
