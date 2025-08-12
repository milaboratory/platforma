import { BlockModel, createPlDataTableStateV2, createPlDataTableV2, ImportFileHandle, InferHrefType, InferOutputsType, PlDataTableStateV2 } from '@platforma-sdk/model';
import type { Spec, SpecUI } from './types';

export type BlockArgs = {
  spec?: Spec;
  fileExt?: 'csv' | 'tsv';
  fileHandle?: ImportFileHandle;
};

export type BlockUiState = {
  spec?: SpecUI;
  fileExt?: 'csv' | 'tsv';
  fileHandle?: ImportFileHandle;
  tableState: PlDataTableStateV2;
};

export const platforma = BlockModel.create('Heavy')

  .withUiState<BlockUiState>({
    tableState: createPlDataTableStateV2(),
  })
  
  .withArgs<BlockArgs>({})

  .argsValid((ctx) => {
    return ctx.args.spec != null 
      && Array.isArray(ctx.args.spec.axes)
      && ctx.args.spec.axes.length > 0
      && ctx.args.fileHandle != null 
      && ctx.args.fileExt != null;
  })

  .output('fileUploader', (ctx) => ctx.outputs?.resolve('fileUploader')?.getImportProgress())
  
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

