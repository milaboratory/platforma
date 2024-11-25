import {
  BlockModel,
  InferHrefType,
  InferOutputsType,
  mapJoinEntry,
  PColumnIdAndSpec,
  AxisSpec,
  JoinEntry,
  AxisId,
  PlDataTableState,
  ValueType,
  isPColumn,
  PlDataTableGridState
} from '@platforma-sdk/model';
import { z } from 'zod';

export const $BlockArgs = z.object({
  numbers: z.array(z.coerce.number())
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export type TableState = {
  settingsOpened: boolean;
  gridState: PlDataTableGridState;
  group: {
    mainColumn?: PColumnIdAndSpec;
    additionalColumns: PColumnIdAndSpec[];
    enrichmentColumns: PColumnIdAndSpec[];
    possiblePartitioningAxes: AxisSpec[];
    join?: JoinEntry<PColumnIdAndSpec>;
  };
  partitioningAxes: AxisId[];
  tableState: PlDataTableState;
};

export type UiState = {
  dataTableState: TableState | undefined;
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ numbers: [1, 2, 3] })

  .withUiState<UiState>({ dataTableState: undefined })

  .output('numbers', (ctx) => ctx.outputs?.resolve('numbers')?.getDataAsJson<number[]>())

  .output('pFrame', (ctx) => {
    const collection = ctx.resultPool.getData();
    if (collection === undefined || !collection.isComplete) return undefined;

    const valueTypes = ['Int', 'Long', 'Float', 'Double', 'String', 'Bytes'] as ValueType[];
    const columns = collection.entries
      .map(({ obj }) => obj)
      .filter(isPColumn)
      .filter((column) => valueTypes.find((valueType) => valueType === column.spec.valueType));

    try {
      return ctx.createPFrame(columns);
    } catch (err) {
      return undefined;
    }
  })

  .output('pTable', (ctx) => {
    const join = ctx.uiState?.dataTableState?.tableState.pTableParams?.join;
    if (!join) return undefined;

    const collection = ctx.resultPool.getData();
    if (!collection || !collection.isComplete) return undefined;

    const columns = collection.entries.map(({ obj }) => obj).filter(isPColumn);
    if (columns.length === 0) return undefined;

    let columnMissing = false;
    const src = mapJoinEntry(join, (idAndSpec) => {
      const column = columns.find((it) => it.id === idAndSpec.columnId);
      if (!column) columnMissing = true;
      return column!;
    });

    if (columnMissing) return undefined;

    return ctx.createPTable({
      src,
      filters: ctx.uiState.dataTableState?.tableState.pTableParams?.filters ?? [],
      sorting: ctx.uiState.dataTableState?.tableState.pTableParams?.sorting ?? []
    });
  })

  .sections((ctx) => {
    return [
      { type: 'link', href: '/', label: 'Icons/Masks' },
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
    ];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
