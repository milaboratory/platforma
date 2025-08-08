import { BlockModel, ImportFileHandle, InferHrefType, InferOutputsType } from '@platforma-sdk/model';
import type { Spec, SpecUI } from './types';

export type BlockArgs = {
  fileHandle?: ImportFileHandle;
  fileExt?: 'csv' | 'tsv';
  spec?: Spec;
};

export type BlockUiState = {
  spec?: SpecUI;
};

export const platforma = BlockModel.create('Heavy')

  .withUiState<BlockUiState>({})
  
  .withArgs<BlockArgs>({})

  .output('fileUploadProgress', (ctx) => ctx.outputs?.resolve('fileUploadProgress')?.getImportProgress())

  .sections((_) => [{ type: 'link', href: '/', label: 'Main' }])

  .done(2);

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;

export * from './types';

