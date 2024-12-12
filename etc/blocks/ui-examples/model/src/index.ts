import {
  BlockModel,
  InferHrefType,
  InferOutputsType,
  PlDataTableState,
  ValueType,
  isPColumn,
  isPColumnSpec,
  PlRef,
  getUniquePartitionKeys,
  createPlDataTableSheet,
  createPlDataTable,
  PlTableFiltersModel
} from '@platforma-sdk/model';
import { z } from 'zod';

export const $BlockArgs = z.object({
  numbers: z.array(z.coerce.number())
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export type TableState = {
  tableState: PlDataTableState;
  anchorColumn?: PlRef;
  filterModel: PlTableFiltersModel;
};

export type UiState = {
  dataTableState: TableState | undefined;
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ numbers: [1, 2, 3] })

  .withUiState<UiState>({ dataTableState: undefined })

  .output('numbers', (ctx) => ctx.outputs?.resolve('numbers')?.getDataAsJson<number[]>())

  .retentiveOutput('inputOptions', (ctx) => {
    return ctx.resultPool.getOptions((spec) => isPColumnSpec(spec));
  })

  .output('sheets', (ctx) => {
    if (!ctx.uiState?.dataTableState?.anchorColumn) return undefined;

    const anchor = ctx.resultPool.getPColumnByRef(ctx.uiState.dataTableState.anchorColumn);
    if (!anchor) return undefined;

    const r = getUniquePartitionKeys(anchor.data);
    if (!r) return undefined;
    return r.map((values, i) => createPlDataTableSheet(ctx, anchor.spec.axesSpec[i], values));
  })

  .output('pt', (ctx) => {
    if (ctx.uiState?.dataTableState?.anchorColumn === undefined) return undefined;

    const anchorColumn = ctx.resultPool.getDataByRef(ctx.uiState.dataTableState.anchorColumn);
    if (!anchorColumn || !isPColumn(anchorColumn)) {
      console.error('Anchor column is undefined or is not PColumn', anchorColumn);
      return undefined;
    }

    // wait until sheet filters are set
    if (ctx.uiState.dataTableState.tableState.pTableParams?.filters === undefined) return undefined;

    return createPlDataTable(ctx, [anchorColumn], ctx.uiState.dataTableState.tableState, [
      ...ctx.uiState.dataTableState.tableState.pTableParams?.filters,
      ...(ctx.uiState.dataTableState.filterModel?.filters ?? [])
    ]);
  })

  .sections((ctx) => {
    return [
      { type: 'link', href: '/', label: 'Icons/Masks' },
      { type: 'link', href: '/layout', label: 'Layout' },
      { type: 'link', href: '/form-components', label: 'Form Components' },
      { type: 'link', href: '/log-view', label: 'PlLogView' },
      { type: 'link', href: '/modals', label: 'Modals' },
      { type: 'link', href: '/select-files', label: 'Select Files' },
      { type: 'link', href: '/inject-env', label: 'Inject env' },
      { type: 'link', href: '/dropdowns', label: 'Dropdowns' },
      { type: 'link', href: '/use-watch-fetch', label: 'useWatchFetch' },
      { type: 'link', href: '/typography', label: 'Typography' },
      { type: 'link', href: '/ag-grid-vue', label: 'AgGridVue' },
      { type: 'link', href: '/pl-ag-data-table', label: 'PlAgDataTable' },
      { type: 'link', href: '/errors', label: 'Errors' },
      { type: 'link', href: '/text-fields', label: 'PlTextField' },
      { type: 'link', href: '/tabs', label: 'PlTabs' },
      { type: 'link', href: '/drafts', label: 'Drafts' },
      { type: 'link', href: '/buttons', label: 'ButtonsPage' },
    ];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
