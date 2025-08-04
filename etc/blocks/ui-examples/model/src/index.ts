import type {
  ImportFileHandle,
  InferHrefType,
  InferOutputsType,
  PColumn,
  PColumnValues,
  PObjectId,
  PlDataTableStateV2,
  PlDataTableSheet,
} from '@platforma-sdk/model';
import {
  Annotation,
  BlockModel,
  createPlDataTableStateV2,
  createPlDataTableV2,
  PColumnName,
  stringifyJson,
  ValueType,
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
  numbers: z.array(z.coerce.number()),
  handles: z.array(ImportFileHandleSchema),
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export type UiState = {
  dataTableV2: {
    sourceId?: string;
    numRows: number;
    state: PlDataTableStateV2;
  };
  dynamicSections: {
    id: string;
    label: string;
  }[];
  datasets: {
    id: string;
    label: string;
  }[];
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({ numbers: [1, 2, 3, 4], handles: [] })

  .withUiState<UiState>({
    dataTableV2: {
      sourceId: 'source_1',
      numRows: 200,
      state: createPlDataTableStateV2(),
    },
    dynamicSections: [],
    datasets: [],
  })

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

  .output('ptV2Sheets', (ctx) => {
    const rowCount = ctx.uiState.dataTableV2.numRows ?? 0;
    const sheets = [
      {
        axis: {
          type: ValueType.Int,
          name: 'part',
          annotations: {
            [Annotation.Label]: 'Partitioned axis',
            [Annotation.DiscreteValues]: stringifyJson([0, 1]),
          } satisfies Annotation,
        },
        options: [
          { value: 0, label: 'Partition 1' },
          { value: 1, label: 'Partition 2' },
        ],
      } satisfies PlDataTableSheet,
    ];
    return rowCount > 0 ? sheets : [];
  })

  .output('ptV2', (ctx) => {
    const rowCount = ctx.uiState.dataTableV2.numRows ?? 0;
    const makePartitionId = (rowCount: number, i: number) => Math.floor((2 * i) / (rowCount + 1));
    const columns: PColumn<PColumnValues>[] = [
      {
        id: 'column1' as PObjectId,
        spec: {
          kind: 'PColumn',
          valueType: ValueType.String,
          name: 'example',
          annotations: {
            [Annotation.Label]: 'String column',
            [Annotation.DiscreteValues]: stringifyJson(['up', 'down']),
            [Annotation.Table.OrderPriority]: stringifyJson(101),
          } satisfies Annotation,
          axesSpec: [
            {
              type: ValueType.Int,
              name: 'part',
              annotations: {
                [Annotation.Label]: 'Partitioned axis',
                [Annotation.DiscreteValues]: stringifyJson([0, 1]),
              } satisfies Annotation,
            },
            {
              type: ValueType.Int,
              name: 'index',
              annotations: {
                [Annotation.Label]: 'Int axis',
              } satisfies Annotation,
            },
          ],
        },
        data: times(rowCount, (i) => {
          const v = i + 1;
          return {
            key: [makePartitionId(rowCount, v), v],
            val: v.toString(),
          };
        }),
      },
      {
        id: 'column2' as PObjectId,
        spec: {
          kind: 'PColumn',
          valueType: ValueType.Float,
          name: 'value',
          annotations: {
            [Annotation.Label]: 'Float column',
            [Annotation.Table.Visibility]: 'optional',
            [Annotation.Table.OrderPriority]: stringifyJson(100),
          } satisfies Annotation,
          axesSpec: [
            {
              type: ValueType.Int,
              name: 'part',
              annotations: {
                [Annotation.Label]: 'Partitioned axis',
                [Annotation.DiscreteValues]: stringifyJson([0, 1]),
              } satisfies Annotation,
            },
            {
              type: ValueType.Int,
              name: 'index',
              annotations: {
                [Annotation.Label]: 'Int axis',
              } satisfies Annotation,
            },
          ],
        },
        data: times(rowCount, (i) => {
          const v = i + 1;
          return {
            key: [makePartitionId(rowCount, v), v],
            val: v + 0.1,
          };
        }),
      },
      {
        id: 'labelColumn' as PObjectId,
        spec: {
          kind: 'PColumn',
          valueType: ValueType.Int,
          name: PColumnName.Label,
          annotations: {
            [Annotation.Label]: 'Int axis labels',
          } satisfies Annotation,
          axesSpec: [
            {
              type: ValueType.Int,
              name: 'index',
              annotations: {
                [Annotation.Label]: 'Int axis',
              } satisfies Annotation,
            },
          ],
        },
        data: times(rowCount, (i) => {
          const v = i + 1;
          return {
            key: [v],
            val: 100000 - v,
          };
        }),
      },
      {
        id: 'linkerColumn' as PObjectId,
        spec: {
          kind: 'PColumn',
          valueType: ValueType.Int,
          name: 'linker',
          annotations: {
            [Annotation.Label]: 'Index axis linker',
            [Annotation.IsLinkerColumn]: stringifyJson(true),
            [Annotation.Table.Visibility]: 'hidden',
          } satisfies Annotation,
          axesSpec: [
            {
              type: ValueType.Int,
              name: 'index',
              annotations: {
                [Annotation.Label]: 'Int axis',
              } satisfies Annotation,
            },
            {
              type: ValueType.Int,
              name: 'linkedIndex',
              annotations: {
                [Annotation.Label]: 'Linked int axis',
              } satisfies Annotation,
            },
          ],
        },
        data: times(rowCount, (i) => {
          const v = i + 1;
          return {
            key: [v, v],
            val: 1,
          };
        }),
      },
    ];
    for (let j = 1; j < 10; ++j) {
      columns.push({
        id: `alphabeticalColumn${j}` as PObjectId,
        spec: {
          kind: 'PColumn',
          valueType: ValueType.String,
          name: 'value',
          annotations: {
            [Annotation.Label]: `Alphabetical column ${j}`,
            [Annotation.Table.Visibility]: 'optional',
            [Annotation.Table.OrderPriority]: stringifyJson(10 - j),
          } satisfies Annotation,
          axesSpec: [
            {
              type: ValueType.Int,
              name: 'linkedIndex',
              annotations: {
                [Annotation.Label]: 'Linked int axis',
              } satisfies Annotation,
            },
          ],
        },
        data: times(rowCount, (i) => {
          const v = i + 1;
          return {
            key: [v],
            val: v.toString().repeat(j),
          };
        }),
      });
    }
    return createPlDataTableV2(
      ctx,
      columns,
      ctx.uiState.dataTableV2.state,
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
      { type: 'link', href: '/state', label: 'State' },
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
      { type: 'link', href: '/pl-ag-data-table-v2', label: 'PlAgDataTableV2' },
      { type: 'link', href: '/pl-splash-page', label: 'PlSplashPage' },
      { type: 'link', href: '/pl-file-input-page', label: 'PlFileInputPage' },
      { type: 'link', href: '/pl-number-field-page', label: 'PlNumberFieldPage' },
      { type: 'link', href: '/pl-error-boundary-page', label: 'PlErrorBoundaryPage' },
      { type: 'link', href: '/pl-element-list-page', label: 'PlElementList' },
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

  .done(2); // api version 2

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
