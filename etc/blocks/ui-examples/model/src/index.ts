import type {
  InferHrefType,
  InferOutputsType,
  PlDataTableState,
  PlTableFiltersModel,
  PColumn,
  PColumnValues,
  PObjectId,
  ImportFileHandle,
} from '@platforma-sdk/model';
import {
  BlockModel,
  createPlDataTable,
} from '@platforma-sdk/model';
import { z } from 'zod';

export const ImportFileHandleSchema = z
  .string()
  .optional()
  .refine<ImportFileHandle | undefined>(
    ((_a) => true) as (arg: string | undefined) => arg is ImportFileHandle | undefined,
  );

export function* range(from: number, to: number, step = 1) {
  for (let i = from; i < to; i += step) {
    yield i;
  }
}

export function toList<T>(iterable: Iterable<T>): T[] {
  const lst: T[] = [];
  for (const it of iterable) {
    lst.push(it);
  }

  return lst;
}

export function times<R>(n: number, cb: (i: number) => R): R[] {
  return toList(range(0, n)).map(cb);
}

export const $BlockArgs = z.object({
  tableNumRows: z.number().default(100),
  numbers: z.array(z.coerce.number()),
  handles: z.array(ImportFileHandleSchema),
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export type TableState = {
  tableState: PlDataTableState;
  filterModel: PlTableFiltersModel;
};

export type UiState = {
  dataTableState: TableState | undefined;
  dynamicSections: {
    id: string;
    label: string;
  }[];
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ numbers: [1, 2, 3, 4], tableNumRows: 100, handles: [] })

  .withUiState<UiState>({ dataTableState: undefined, dynamicSections: [] })

  .argsValid((ctx) => {
    if (ctx.args.numbers.length === 5) {
      throw new Error('argsValid: test error');
    }

    return ctx.args.numbers.length > 0;
  })

  .output('numbers', (ctx) => ctx.outputs?.resolve('numbers')?.getDataAsJson<number[]>())

  .output('progresses', (ctx) => {
    const m = ctx.outputs?.resolve('progresses');
    const progresses = m?.mapFields((name, val) => [name, val?.getImportProgress()] as const);
    return Object.fromEntries(progresses ?? []);
  })

  .output('pt', (ctx) => {
    if (!ctx.uiState?.dataTableState?.tableState.pTableParams?.filters) return undefined;

    const data = times(ctx.args.tableNumRows ?? 0, (i) => {
      const v = i + 1;
      return {
        key: [v, v + 0.1],
        val: v.toString(),
      };
    });

    return createPlDataTable(
      ctx,
      [
        {
          id: 'example' as PObjectId,
          spec: {
            kind: 'PColumn',
            valueType: 'String',
            name: 'example',
            annotations: {
              'pl7.app/label': 'String column',
              'pl7.app/discreteValues': '["up","down"]',
            },
            axesSpec: [
              {
                type: 'Int',
                name: 'index',
                annotations: {
                  'pl7.app/label': 'Int axis',
                  'pl7.app/discreteValues': '[1,2]',
                },
              },
              {
                type: 'Float',
                name: 'value',
                annotations: {
                  'pl7.app/label': 'Float axis',
                  'pl7.app/table/visibility': 'optional',
                },
              },
            ],
          },
          data,
        } satisfies PColumn<PColumnValues>,
      ],
      ctx.uiState.dataTableState.tableState,
      {
        filters: [
          ...(ctx.uiState.dataTableState.tableState.pTableParams?.filters ?? []),
          ...(ctx.uiState.dataTableState.filterModel?.filters ?? []),
        ],
      },
    );
  })

  .title((ctx) => {
    if (ctx.args.numbers.length === 5) {
      throw new Error('block title: test error');
    }

    return 'Ui Examples';
  })

  .sections((ctx) => {
    const dynamicSections = (ctx.uiState.dynamicSections ?? []).map((it) => ({
      type: 'link' as const,
      href: `/section?id=${it.id}` as const,
      label: it.label,
    }));

    if (dynamicSections.some((it) => it.label === 'Error')) {
      throw new Error('sections: test error');
    }

    return [
      { type: 'link', href: '/loaders', label: 'Loaders' },
      { type: 'link', href: '/', label: 'Icons/Masks' },
      { type: 'link', href: '/layout', label: 'Layout' },
      { type: 'link', href: '/form-components', label: 'Form Components' },
      { type: 'link', href: '/log-view', label: 'PlLogView' },
      { type: 'link', href: '/modals', label: 'Modals' },
      { type: 'link', href: '/select-files', label: 'Select Files' },
      { type: 'link', href: '/inject-env', label: 'Inject env' },
      { type: 'link', href: '/use-watch-fetch', label: 'useWatchFetch' },
      { type: 'link', href: '/typography', label: 'Typography' },
      { type: 'link', href: '/ag-grid-vue', label: 'AgGridVue' },
      { type: 'link', href: '/ag-grid-vue-with-builder', label: 'AgGridVue with builder' },
      { type: 'link', href: '/pl-ag-data-table', label: 'PlAgDataTable' },
      { type: 'link', href: '/pl-splash-page', label: 'PlSplashPage' },
      { type: 'link', href: '/errors', label: 'Errors' },
      { type: 'link', href: '/text-fields', label: 'PlTextField' },
      { type: 'link', href: '/tabs', label: 'PlTabs' },
      { type: 'link', href: '/stacked-bar', label: 'PlChartStackedBar' },
      { type: 'link', href: '/histogram', label: 'PlChartHistogram' },
      { type: 'link', href: '/buttons', label: 'ButtonsPage' },
      { type: 'link', href: '/notifications', label: 'Notifications' },
      { type: 'link', href: '/drafts', label: 'Drafts' },
      { type: 'link', href: '/pl-autocomplete', label: 'PlAutocomplete' },
      { type: 'link', href: '/radio', label: 'PlRadio' },
      ...(dynamicSections.length
        ? [
            { type: 'delimiter' },
            ...dynamicSections,
            { type: 'delimiter' }] as const
        : []),
      {
        type: 'link',
        href: '/add-section',
        appearance: 'add-section',
        label: 'New Dynamic section',
      },
    ];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
