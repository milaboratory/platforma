import { BlockModel, createPlDataTableStateV2, createPlDataTableV2, ImportFileHandle, InferHrefType, InferOutputsType, PlDataTableStateV2 } from '@platforma-sdk/model';
import type { Spec, SpecUI } from './types';

export type BlockArgs = {
  fileHandle?: ImportFileHandle;
  fileExt?: 'csv' | 'tsv';
  spec?: Spec;
};

export type BlockUiState = {
  tab?: 'spec' | 'data';
  spec?: SpecUI;
  tableState: PlDataTableStateV2;
};

export const platforma = BlockModel.create('Heavy')

  .withUiState<BlockUiState>({
    tab: 'spec',
    tableState: createPlDataTableStateV2(),
  })
  
  .withArgs<BlockArgs>({})

  .output('fileUploadProgress', (ctx) => ctx.outputs?.resolve('fileUploadProgress')?.getImportProgress())
  
  .output('filePFrame', (ctx) => {
    const pCols = ctx.outputs?.resolve('filePFrame')?.getPColumns();
    if (pCols == null) return undefined;
    return createPlDataTableV2(ctx, pCols, ctx.uiState?.tableState ?? createPlDataTableStateV2());
  })

  .sections((_) => [
    { type: 'link', href: '/', label: 'Import' },
    { type: 'link', href: '/data', label: 'Data' },
  ])

  .done(2);

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;

export * from './types';

