import { BlockModel, ImportFileHandle, InferHrefType, InferOutputsType } from '@platforma-sdk/model';
import type { Spec } from './types';

export type BlockArgs = {
  fileHandle?: ImportFileHandle;
  fileExt?: '.csv' | '.tsv';
  spec?: Spec;
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ fileHandle: undefined })

  .output('fileUploadProgress', (ctx) => ctx.outputs?.resolve('fileUploadProgress')?.getImportProgress())

  .sections((_) => [{ type: 'link', href: '/', label: 'Main' }])

  .done(2);

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;

export { AxisSpecParam, ColumnSpecParam, Spec, ValueType } from './types';

