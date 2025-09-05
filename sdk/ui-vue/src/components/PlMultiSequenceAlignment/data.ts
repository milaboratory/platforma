import { isJsonEqual } from '@milaboratories/helpers';
import type { ListOptionNormalized } from '@milaboratories/uikit';
import {
  Annotation,
  type CalculateTableDataRequest,
  type CalculateTableDataResponse,
  type CanonicalizedJson,
  canonicalizeJson,
  createRowSelectionColumn,
  ensureError,
  getAxisId,
  getRawPlatformaInstance,
  isLabelColumn,
  isLinkerColumn,
  type JoinEntry,
  matchAxisId,
  parseJson,
  type PColumnIdAndSpec,
  type PFrameHandle,
  type PlMultiSequenceAlignmentColorSchemeOption,
  type PlMultiSequenceAlignmentSettings,
  type PlSelectionModel,
  type PObjectId,
  type PTableColumnId,
  type PTableSorting,
  pTableValue,
  readAnnotation,
  readAnnotationJson,
} from '@platforma-sdk/model';
import { onWatcherCleanup, ref, watch } from 'vue';
import { objectHash } from '../../objectHash';
import { highlightByChemicalProperties } from './chemical-properties';
import type { Markup } from './markup';
import {
  highlightByMarkup,
  markupAlignedSequence,
  parseMarkup,
} from './markup';
import type * as MultiSequenceAlignmentWorker from './multi-sequence-alignment.worker';
import type * as PhylogeneticTreeWorker from './phylogenetic-tree.worker';
import { getResidueCounts } from './residue-counts';
import type { HighlightLegend, ResidueCounts } from './types';

const getPFrameDriver = () => getRawPlatformaInstance().pFrameDriver;

export const SEQUENCE_LIMIT = 1000;

export const useSequenceColumnsOptions = refreshOnDeepChange(
  getSequenceColumnsOptions,
);

export const useLabelColumnsOptions = refreshOnDeepChange(
  getLabelColumnsOptions,
);

export const useMarkupColumnsOptions = refreshOnDeepChange(
  getMarkupColumnsOptions,
);

export const useMultipleAlignmentData = refreshOnDeepChange(
  getMultipleAlignmentData,
);

async function getSequenceColumnsOptions({ pFrame, sequenceColumnPredicate }: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnPredicate: (column: PColumnIdAndSpec) => boolean;
}): Promise<OptionsWithDefaults<PObjectId> | undefined> {
  if (!pFrame) return;

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);

  const options = columns.values()
    .filter((column) => sequenceColumnPredicate(column))
    .map(({ spec, columnId }) => ({
      label: readAnnotation(spec, Annotation.Label) ?? 'Unlabeled column',
      value: columnId,
    }))
    .toArray();

  const defaults = options.map(({ value }) => value);

  return { options, defaults };
}

async function getLabelColumnsOptions({ pFrame, sequenceColumnIds }: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[] | undefined;
}): Promise<OptionsWithDefaults<PTableColumnId> | undefined> {
  if (!pFrame || !sequenceColumnIds) return;

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);

  const sequenceColumnsAxes = new Map(
    sequenceColumnIds.values().flatMap((id) => {
      const column = columns.find(({ columnId }) => columnId === id);
      if (!column) {
        throw new Error(`Couldn't find sequence column (ID: \`${id}\`).`);
      }
      return column.spec.axesSpec.values()
        .map((spec) => [canonicalizeJson(getAxisId(spec)), spec]);
    }),
  );

  const optionMap = new Map<CanonicalizedJson<PTableColumnId>, string>();
  for (const [axisIdJson, axisSpec] of sequenceColumnsAxes.entries()) {
    const axisId = parseJson(axisIdJson);
    const labelColumn = columns.find(({ spec }) =>
      isLabelColumn(spec) && matchAxisId(axisId, getAxisId(spec.axesSpec[0])),
    );
    optionMap.set(
      labelColumn
        ? canonicalizeJson({ type: 'column', id: labelColumn.columnId })
        : canonicalizeJson({ type: 'axis', id: axisId }),
      readAnnotation(labelColumn?.spec, Annotation.Label)
      ?? readAnnotation(axisSpec, Annotation.Label)
      ?? 'Unlabeled axis',
    );
  }

  const { hits: compatibleColumns } = await pFrameDriver.findColumns(pFrame, {
    columnFilter: {},
    compatibleWith: sequenceColumnsAxes.keys()
      .map((axisIdJson) => parseJson(axisIdJson))
      .toArray(),
    strictlyCompatible: false,
  });

  for (const { columnId, spec } of compatibleColumns) {
    const columnIdJson = canonicalizeJson<PTableColumnId>({
      type: 'column',
      id: columnId,
    });
    if (optionMap.has(columnIdJson)) continue;
    optionMap.set(
      columnIdJson,
      readAnnotation(spec, Annotation.Label) ?? 'Unlabeled column',
    );
  }

  const options = optionMap.entries()
    .map(([value, label]) => ({ label, value: parseJson(value) }))
    .toArray();

  const defaults = options.values()
    .filter(({ value }) => {
      if (value.type === 'axis') return true;
      const column = columns.find(({ columnId }) => columnId === value.id);
      return column && isLabelColumn(column.spec);
    })
    .map(({ value }) => value)
    .toArray();

  return { options, defaults };
}

async function getMarkupColumnsOptions({ pFrame, sequenceColumnIds }: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[] | undefined;
}): Promise<ListOptionNormalized<PObjectId[]>[] | undefined> {
  if (!pFrame || !sequenceColumnIds) return;

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);

  const sequenceColumns = sequenceColumnIds.map((columnId) => {
    const column = columns.find((column) => column.columnId === columnId);
    if (!column) {
      throw new Error(
        `Couldn't find sequence column (ID: \`${sequenceColumnIds[0]}\`).`,
      );
    }
    return column;
  });

  const columnPairs = sequenceColumns
    .flatMap((sequenceColumn) =>
      columns
        .filter((column) =>
          readAnnotationJson(column.spec, Annotation.Sequence.IsAnnotation)
          && isJsonEqual(sequenceColumn.spec.axesSpec, column.spec.axesSpec)
          && Object.entries(sequenceColumn.spec.domain ?? {})
            .every(([key, value]) => column.spec.domain?.[key] === value),
        )
        .map((markupColumn) => ({ markupColumn, sequenceColumn })),
    );

  const groupedByDomainDiff = Map.groupBy(
    columnPairs,
    ({ markupColumn, sequenceColumn }) => {
      const domainDiff = Object.fromEntries(
        Object.entries(markupColumn.spec.domain ?? {})
          .filter(([key]) => sequenceColumn.spec.domain?.[key] == undefined),
      );
      return canonicalizeJson(domainDiff);
    },
  );

  return groupedByDomainDiff.entries()
    .map(([domainDiffJson, columnPairs]) => ({
      label: Object.values(parseJson(domainDiffJson)).join(', '),
      value: columnPairs.map(({ markupColumn }) => markupColumn.columnId),
    }))
    .toArray();
}

async function getMultipleAlignmentData(
  {
    pFrame,
    sequenceColumnIds,
    labelColumnIds,
    selection,
    colorScheme,
    alignmentParams,
    shouldBuildPhylogeneticTree,
  }: {
    pFrame: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[] | undefined;
    labelColumnIds: PTableColumnId[] | undefined;
    selection: PlSelectionModel | undefined;
    colorScheme: PlMultiSequenceAlignmentColorSchemeOption;
    alignmentParams: PlMultiSequenceAlignmentSettings['alignmentParams'];
    shouldBuildPhylogeneticTree: boolean;
  },
  abortSignal: AbortSignal,
): Promise<MultipleAlignmentData | undefined> {
  if (!pFrame || !sequenceColumnIds?.length || !labelColumnIds) return;

  const table = await getTableData({
    pFrame,
    sequenceColumnIds,
    labelColumnIds,
    selection,
    colorScheme,
  });

  const rowCount = table.at(0)?.data.data.length ?? 0;

  if (rowCount < 2) return;

  const exceedsLimit = rowCount > SEQUENCE_LIMIT;
  const rawSequences = extractSequences(sequenceColumnIds, table);
  const labels = extractLabels(labelColumnIds, table);
  const markups = colorScheme.type === 'markup'
    ? extractMarkups(colorScheme.columnIds, table)
    : undefined;

  const highlightLegend: HighlightLegend = {};

  const alignedSequences = await Promise.all(
    rawSequences.map(async ({ name, rows }) => ({
      name,
      rows: await alignSequences(
        rows,
        JSON.parse(JSON.stringify(alignmentParams)),
        abortSignal,
      ),
    })),
  );

  let phylogeneticTree: PhylogeneticTreeWorker.TreeNodeData[] | undefined;
  if (shouldBuildPhylogeneticTree) {
    phylogeneticTree = await buildPhylogeneticTree(
      alignedSequences,
      abortSignal,
    );
    const rowOrder = phylogeneticTree.values()
      .filter(({ id }) => id >= 0)
      .map(({ id }) => id)
      .toArray();
    for (const sequencesColumn of alignedSequences) {
      sequencesColumn.rows = rowOrder.map((i) => sequencesColumn.rows[i]);
    }
    for (const labelsColumn of labels) {
      labelsColumn.rows = rowOrder.map((i) => labelsColumn.rows[i]);
    }
    for (const markupsColumn of markups ?? []) {
      markupsColumn.rows = rowOrder.map((i) => markupsColumn.rows[i]);
    }
  }

  const sequences = await Promise.all(
    alignedSequences.map(async ({ name, rows }, index) => {
      const residueCounts = getResidueCounts(rows);
      const image = generateHighlightImage({
        colorScheme,
        sequences: rows,
        residueCounts,
        markup: markups?.at(index),
      });
      if (image) {
        Object.assign(highlightLegend, image.legend);
      }
      return {
        name,
        rows,
        residueCounts,
        ...image && {
          highlightImageUrl: await blobToBase64(image.blob),
        },
      } satisfies MultipleAlignmentData['sequences'][number];
    }),
  );

  return {
    sequences,
    labels,
    ...Object.keys(highlightLegend).length && {
      highlightLegend,
    },
    ...phylogeneticTree && {
      phylogeneticTree,
    },
    exceedsLimit,
  };
}

async function getTableData(
  { pFrame, sequenceColumnIds, labelColumnIds, selection, colorScheme }: {
    pFrame: PFrameHandle;
    sequenceColumnIds: PObjectId[];
    labelColumnIds: PTableColumnId[];
    selection: PlSelectionModel | undefined;
    colorScheme: PlMultiSequenceAlignmentColorSchemeOption;
  },
): Promise<CalculateTableDataResponse> {
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const linkerColumns = columns.filter((column) => isLinkerColumn(column.spec));

  const filterColumn = createRowSelectionColumn({ selection });

  // inner join of sequence columns
  let primaryEntry: JoinEntry<PObjectId> = {
    type: 'inner',
    entries: sequenceColumnIds.map((column) => ({
      type: 'column',
      column,
    })),
  };

  // if we have linkers, left join them
  if (linkerColumns.length > 0) {
    primaryEntry = {
      type: 'outer',
      primary: primaryEntry,
      secondary: linkerColumns.map(({ columnId }) => ({
        type: 'column',
        column: columnId,
      })),
    };
  }

  // inner join with filters
  if (filterColumn) {
    primaryEntry = {
      type: 'inner',
      entries: [
        primaryEntry,
        {
          type: 'inlineColumn',
          column: filterColumn,
        },
      ],
    };
  }

  // left join with labels
  const secondaryEntry: JoinEntry<PObjectId>[] = labelColumnIds
    .flatMap((column) => {
      if (column.type !== 'column') return [];
      return { type: 'column', column: column.id };
    });

  // and markup
  if (colorScheme.type === 'markup') {
    for (const column of colorScheme.columnIds) {
      secondaryEntry.push({ type: 'column', column });
    }
  }

  const sorting: PTableSorting[] = Array.from(
    new Set(
      sequenceColumnIds.values().flatMap((id) => {
        const column = columns.find(({ columnId }) => columnId === id);
        if (!column) {
          throw new Error(`Couldn't find sequence column (ID: ${id})`);
        }
        return column.spec.axesSpec
          .map((spec) => canonicalizeJson(getAxisId(spec)));
      }),
    ),
  )
    .sort()
    .map((id) => ({
      column: { type: 'axis', id: parseJson(id) },
      ascending: true,
      naAndAbsentAreLeastValues: true,
    }));

  const request: CalculateTableDataRequest<PObjectId> = {
    src: {
      type: 'outer',
      primary: primaryEntry,
      secondary: secondaryEntry,
    },
    filters: [],
    sorting,
  };

  return pFrameDriver.calculateTableData(
    pFrame,
    JSON.parse(JSON.stringify(request)),
    {
      offset: 0,
      // +1 is a hack to check whether the selection is over the limit
      length: SEQUENCE_LIMIT + 1,
    },
  );
}

const extractSequences = (
  columnIds: PObjectId[],
  table: CalculateTableDataResponse,
): { name: string; rows: string[] }[] =>
  columnIds.map((columnId) => {
    const column = table.find(({ spec }) => spec.id === columnId);
    if (!column) {
      throw new Error(`Couldn't find sequence column (ID: \`${columnId}\`).`);
    }
    const name = readAnnotation(column.spec.spec, Annotation.Label)
      ?? 'Unlabeled column';
    const rows = column.data.data
      .keys()
      .take(SEQUENCE_LIMIT)
      .map((row) =>
        pTableValue(column.data, row, { absent: '', na: '' })?.toString()
        ?? '',
      )
      .toArray();
    return { name, rows };
  });

const extractLabels = (
  columnIds: PTableColumnId[],
  table: CalculateTableDataResponse,
): { rows: string[] }[] =>
  columnIds.map((columnId) => {
    const column = table.find(({ spec }) => {
      if (columnId.type === 'axis' && spec.type === 'axis') {
        return isJsonEqual(columnId.id, spec.id);
      }
      if (columnId.type === 'column' && spec.type === 'column') {
        return columnId.id === spec.id;
      }
    });
    if (!column) {
      throw new Error(`Couldn't find label column (ID: \`${columnId}\`).`);
    }
    const rows = column.data.data
      .keys()
      .take(SEQUENCE_LIMIT)
      .map((row) =>
        pTableValue(column.data, row, { absent: '', na: '' })?.toString()
        ?? '',
      )
      .toArray();
    return { rows };
  });

const extractMarkups = (
  columnIds: PObjectId[],
  table: CalculateTableDataResponse,
): { labels: Record<string, string>; rows: Markup[] }[] =>
  columnIds.map((columnId) => {
    const column = table.find(({ spec }) => spec.id === columnId);
    if (!column) {
      throw new Error(`Couldn't find markup column (ID: \`${columnId}\`).`);
    }
    const labels = readAnnotationJson(
      column.spec.spec,
      Annotation.Sequence.Annotation.Mapping,
    ) ?? {};
    const rows = column.data.data
      .keys()
      .take(SEQUENCE_LIMIT)
      .map((row) =>
        parseMarkup(
          pTableValue(column.data, row, { absent: '', na: '' })?.toString()
          ?? '',
        ),
      )
      .toArray();
    return { labels, rows };
  });

const alignSequences = (() => {
  const cache = new Map<string, string[]>();
  return async (
    sequences: string[],
    alignmentParams: PlMultiSequenceAlignmentSettings['alignmentParams'],
    abortSignal: AbortSignal,
  ): Promise<string[]> => {
    const hash = await objectHash([sequences, alignmentParams]);
    let result = cache.get(hash);
    if (result) return result;
    result = await runInWorker<
      MultiSequenceAlignmentWorker.RequestMessage,
      MultiSequenceAlignmentWorker.ResponseMessage
    >(
      new Worker(
        new URL('./multi-sequence-alignment.worker.ts', import.meta.url),
        { type: 'module' },
      ),
      { sequences, params: alignmentParams },
      abortSignal,
    );
    cache.set(hash, result);
    return result;
  };
})();

function generateHighlightImage(
  { colorScheme, sequences, residueCounts, markup }: {
    colorScheme: PlMultiSequenceAlignmentColorSchemeOption;
    sequences: string[];
    residueCounts: ResidueCounts;
    markup: { labels: Record<string, string>; rows: Markup[] } | undefined;
  },
): { blob: Blob; legend: HighlightLegend } | undefined {
  if (colorScheme.type === 'chemical-properties') {
    return highlightByChemicalProperties({ sequences, residueCounts });
  }
  if (colorScheme.type === 'markup') {
    if (!markup) {
      throw new Error('Missing markup data.');
    }
    return highlightByMarkup({
      markupRows: sequences.map((sequence, row) => {
        const markupRow = markup.rows.at(row);
        if (!markupRow) throw new Error(`Missing markup for row ${row}.`);
        return markupAlignedSequence(sequence, markupRow);
      }),
      columnCount: sequences.at(0)?.length ?? 0,
      labels: markup.labels,
    });
  }
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });

const buildPhylogeneticTree = (() => {
  const cache = new Map<string, PhylogeneticTreeWorker.TreeNodeData[]>();
  return async (data: { rows: string[] }[], abortSignal: AbortSignal) => {
    const concatenatedSequences = data.at(0)?.rows
      .keys()
      .map((row) => data.map((column) => column.rows.at(row) ?? '').join(''))
      .toArray() ?? [];
    const hash = await objectHash(concatenatedSequences);
    let result = cache.get(hash);
    if (result) return result;
    result = await runInWorker<
      PhylogeneticTreeWorker.RequestMessage,
      PhylogeneticTreeWorker.ResponseMessage
    >(
      new Worker(
        new URL('./phylogenetic-tree.worker.ts', import.meta.url),
        { type: 'module' },
      ),
      concatenatedSequences,
      abortSignal,
    );
    cache.set(hash, result);
    return result;
  };
})();

const runInWorker = <RequestMessage, ResponseMessage>(
  worker: Worker,
  message: RequestMessage,
  abortSignal: AbortSignal,
) =>
  new Promise<ResponseMessage>((resolve, reject) => {
    worker.addEventListener('message', ({ data }) => {
      resolve(data);
      worker.terminate();
    });
    worker.addEventListener('error', ({ error, message }) => {
      reject(error ?? message);
      worker.terminate();
    });
    abortSignal.addEventListener('abort', () => {
      reject(abortSignal.reason);
      worker.terminate();
    });
    worker.postMessage(message);
  });

function refreshOnDeepChange<T, P>(
  cb: (params: P, abortSignal: AbortSignal) => Promise<T>,
) {
  const data = ref<T>();
  const isLoading = ref(true);
  const error = ref<Error>();
  let requestId: symbol;
  return (paramsGetter: () => P) => {
    watch(paramsGetter, async (params, prevParams) => {
      if (isJsonEqual(params, prevParams)) return;
      const abortController = new AbortController();
      const currentRequestId = requestId = Symbol();
      onWatcherCleanup(() => {
        abortController.abort();
      });
      try {
        error.value = undefined;
        isLoading.value = true;
        const result = await cb(params, abortController.signal);
        if (currentRequestId === requestId) {
          data.value = result;
        }
      } catch (err) {
        console.error(err);
        if (currentRequestId === requestId) {
          error.value = ensureError(err);
        }
      } finally {
        if (currentRequestId === requestId) {
          isLoading.value = false;
        }
      }
    }, { immediate: true });
    return { data, isLoading, error };
  };
}

type MultipleAlignmentData = {
  sequences: {
    name: string;
    rows: string[];
    residueCounts: ResidueCounts;
    highlightImageUrl?: string;
  }[];
  labels: {
    rows: string[];
  }[];
  highlightLegend?: HighlightLegend;
  phylogeneticTree?: PhylogeneticTreeWorker.TreeNodeData[];
  exceedsLimit: boolean;
};

type OptionsWithDefaults<T> = {
  options: ListOptionNormalized<T>[];
  defaults: T[];
};
