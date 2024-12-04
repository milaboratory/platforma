import {
  BlockModel,
  getBlobContent,
  getBlobContentAsJson,
  getBlobContentAsString,
  getDownloadedBlobContent,
  getImportProgress,
  getOnDemandBlobContent,
  getResourceField,
  getResourceValueAsJson,
  ImportFileHandle,
  InferHrefType,
  InferOutputsType,
  MainOutputs
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

  .output('blob', getResourceValueAsJson()(getResourceField(MainOutputs, 'blob')))

  .output('handle', getImportProgress(getResourceField(MainOutputs, 'handle')))

  .output('content', getBlobContent(getResourceField(MainOutputs, 'downloadable')))

  .output('contentAsString', getBlobContentAsString(getResourceField(MainOutputs, 'downloadable')))

  .output('contentAsString1', (ctx) =>
    ctx.outputs
      ?.resolve('downloadable')
      ?.getFileContentAsString()
      .mapDefined((v) => v + v)
  )

  .output('contentAsJson', getBlobContentAsJson()(getResourceField(MainOutputs, 'downloadable')))

  .output(
    'downloadedBlobContent',
    getDownloadedBlobContent(getResourceField(MainOutputs, 'downloadable'))
  )

  .output(
    'onDemandBlobContent',
    getOnDemandBlobContent(getResourceField(MainOutputs, 'downloadable'))
  )
  .output('onDemandBlobContent1', (ctx) => ctx.outputs?.resolve('downloadable')?.getFileHandle())

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
