import { isJsonEqual } from '@milaboratories/helpers';
import type { ListOptionNormalized } from '@milaboratories/uikit';
import {
  type CalculateTableDataRequest,
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
  Annotation,
  readAnnotationJson,
} from '@platforma-sdk/model';
import { ref, watch } from 'vue';
import { highlightByChemicalProperties } from './chemical-properties';
import {
  highlightByMarkup,
  markupAlignedSequence,
  parseMarkup,
} from './markup';
import { multiSequenceAlignment } from './multi-sequence-alignment';
import { getResidueCounts } from './residue-counts';
import type { HighlightLegend, ResidueCounts } from './types';

const getPFrameDriver = () => getRawPlatformaInstance().pFrameDriver;

export const sequenceLimit = 1000;

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

async function getSequenceColumnsOptions({
  pFrame,
  sequenceColumnPredicate,
}: {
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

async function getLabelColumnsOptions({
  pFrame,
  sequenceColumnIds,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[] | undefined;
}): Promise<OptionsWithDefaults<PTableColumnId> | undefined> {
  if (!pFrame || !sequenceColumnIds) return;

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const optionMap = new Map<CanonicalizedJson<PTableColumnId>, string>();

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
    const columnIdJson = canonicalizeJson({ type: 'column', id: columnId } satisfies PTableColumnId);
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

async function getMarkupColumnsOptions({
  pFrame,
  sequenceColumnIds,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[] | undefined;
}): Promise<ListOptionNormalized<PObjectId>[] | undefined> {
  if (!pFrame || sequenceColumnIds?.length !== 1) return;

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const sequenceColumn = columns.find((column) =>
    column.columnId === sequenceColumnIds[0],
  );
  if (!sequenceColumn) {
    throw new Error(
      `Couldn't find sequence column (ID: \`${sequenceColumnIds[0]}\`).`,
    );
  }
  return columns.values()
    .filter((column) =>
      !!readAnnotationJson(column.spec, Annotation.Sequence.IsAnnotation)
      && isJsonEqual(sequenceColumn.spec.axesSpec, column.spec.axesSpec)
      && Object.entries(sequenceColumn.spec.domain ?? {}).every((
        [key, value],
      ) => column.spec.domain?.[key] === value),
    ).map(({ columnId, spec }) => ({
      value: columnId,
      label: readAnnotation(spec, Annotation.Label) ?? 'Unlabeled column',
    }))
    .toArray();
}

async function getMultipleAlignmentData({
  pFrame,
  sequenceColumnIds,
  labelColumnIds,
  selection,
  colorScheme,
  alignmentParams,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[] | undefined;
  labelColumnIds: PTableColumnId[] | undefined;
  selection: PlSelectionModel | undefined;
  colorScheme: PlMultiSequenceAlignmentColorSchemeOption;
  alignmentParams: PlMultiSequenceAlignmentSettings['alignmentParams'];
}): Promise<MultipleAlignmentData | undefined> {
  if (!pFrame || !sequenceColumnIds?.length || !labelColumnIds) return;

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
    secondaryEntry.push({ type: 'column', column: colorScheme.columnId });
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

  const table = await pFrameDriver.calculateTableData(
    pFrame,
    JSON.parse(JSON.stringify(request)),
    {
      offset: 0,
      // +1 is a hack to check whether the selection is over the limit
      length: sequenceLimit + 1,
    },
  );

  let rowCount = table?.[0].data.data.length ?? 0;
  let exceedsLimit = false;
  if (rowCount > sequenceLimit) {
    rowCount = sequenceLimit;
    exceedsLimit = true;
  }

  const sequenceColumns = sequenceColumnIds.map((columnId) => {
    const column = table.find(({ spec }) => spec.id === columnId);
    if (!column) {
      throw new Error(`Couldn't find sequence column (ID: \`${columnId}\`).`);
    }
    return column;
  });

  const labelColumns = labelColumnIds.map((labelColumn) => {
    const column = table.find(({ spec }) => {
      if (labelColumn.type === 'axis' && spec.type === 'axis') {
        return isJsonEqual(labelColumn.id, spec.id);
      }
      if (labelColumn.type === 'column' && spec.type === 'column') {
        return labelColumn.id === spec.id;
      }
    });
    if (!column) {
      throw new Error(`Couldn't find label column (ID: \`${labelColumn}\`).`);
    }
    return column;
  });

  const alignedSequences = await Promise.all(
    sequenceColumns.map((column) =>
      multiSequenceAlignment(
        Array.from(
          { length: rowCount },
          (_, row) =>
            pTableValue(column.data, row, { na: '', absent: '' })?.toString()
            ?? '',
        ),
        alignmentParams,
      ),
    ),
  );

  const sequences = Array.from(
    { length: rowCount },
    (_, row) => alignedSequences.map((column) => column[row]),
  );

  const sequenceNames = sequenceColumns.map((column) =>
    readAnnotation(column.spec.spec, Annotation.Label) ?? 'Unlabeled column',
  );

  const labels = Array.from(
    { length: rowCount },
    (_, row) =>
      labelColumns.map((column) =>
        pTableValue(column.data, row, { na: '', absent: '' })?.toString() ?? '',
      ),
  );

  const concatenatedSequences = sequences.map((row) => row.join(' '));
  const residueCounts = getResidueCounts(concatenatedSequences);

  const result: MultipleAlignmentData = {
    sequences: concatenatedSequences,
    sequenceNames,
    labelRows: labels,
    exceedsLimit,
    residueCounts,
  };

  if (colorScheme.type === 'chemical-properties') {
    result.highlightImage = highlightByChemicalProperties({
      sequences: concatenatedSequences,
      residueCounts,
    });
  } else if (colorScheme.type === 'markup') {
    const markupColumn = table.find(({ spec }) =>
      spec.id === colorScheme.columnId,
    );
    if (!markupColumn) {
      throw new Error(
        `Couldn't find markup column (ID: \`${colorScheme.columnId}\`).`,
      );
    }
    const markupRows = Array.from(
      { length: rowCount },
      (_, row) => {
        const markup = parseMarkup(
          pTableValue(markupColumn.data, row, { na: '', absent: '' })
            ?.toString()
            ?? '',
        );
        return markupAlignedSequence(sequences[row][0], markup);
      },
    );
    const labels = readAnnotationJson(markupColumn.spec.spec, Annotation.Sequence.Annotation.Mapping) ?? {};
    result.highlightImage = highlightByMarkup({
      markupRows,
      columnCount: concatenatedSequences.at(0)?.length ?? 0,
      labels,
    });
  }

  return result;
}

function refreshOnDeepChange<T, P>(cb: (params: P) => Promise<T>) {
  const data = ref<T>();
  const isLoading = ref(true);
  const error = ref<Error>();
  let requestId: symbol;
  return (paramsGetter: () => P) => {
    watch(paramsGetter, async (params, prevParams) => {
      if (isJsonEqual(params, prevParams)) return;
      const currentRequestId = requestId = Symbol();
      try {
        error.value = undefined;
        isLoading.value = true;
        const result = await cb(params);
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
  sequences: string[];
  sequenceNames: string[];
  labelRows: string[][];
  residueCounts: ResidueCounts;
  highlightImage?: {
    blob: Blob;
    legend: HighlightLegend;
  };
  exceedsLimit: boolean;
};

type OptionsWithDefaults<T> = {
  options: ListOptionNormalized<T>[];
  defaults: T[];
};
