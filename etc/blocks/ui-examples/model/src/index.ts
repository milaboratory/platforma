import {
  BlockModel,
  InferHrefType,
  InferOutputsType,
  PlDataTableState,
  createPlDataTable,
  PlTableFiltersModel,
  PColumn,
  PColumnValues,
  PObjectId,
} from '@platforma-sdk/model';
import { z } from 'zod';

export const $BlockArgs = z.object({
  numbers: z.array(z.coerce.number())
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export type TableState = {
  tableState: PlDataTableState;
  filterModel: PlTableFiltersModel;
};

export type UiState = {
  dataTableState: TableState | undefined;
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ numbers: [1, 2, 3] })

  .withUiState<UiState>({ dataTableState: undefined })

  .output('numbers', (ctx) => ctx.outputs?.resolve('numbers')?.getDataAsJson<number[]>())

  .output('pt', (ctx) => {
    if (!ctx.uiState?.dataTableState?.tableState.pTableParams?.filters) return undefined;
    return createPlDataTable(ctx, [
      {
        id: "example" as PObjectId,
        spec: {
          kind: 'PColumn',
          valueType: 'String',
          name: 'example',
          annotations: {
            'pl7.app/label': 'String column',
          },
          axesSpec: [
            {
              type: 'Int',
              name: 'index',
              annotations: {
                'pl7.app/label': 'Int axis',
              },
            }
          ]
        },
        data: [
          { key: [1], val: '1' },
          { key: [2], val: '2' }
        ]
      } satisfies PColumn<PColumnValues>
    ], ctx.uiState.dataTableState.tableState, [
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
      { type: 'link', href: '/stacked-bar', label: 'StackedBar' },
      { type: 'link', href: '/buttons', label: 'ButtonsPage' },
      { type: 'link', href: '/notifications', label: 'Notifications' },
    ];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
