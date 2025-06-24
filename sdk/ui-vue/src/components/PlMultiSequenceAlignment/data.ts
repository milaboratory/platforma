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
  type JoinEntry,
  matchAxisId,
  parseJson,
  type PColumnIdAndSpec,
  type PColumnPredicate,
  type PFrameHandle,
  type PlSelectionModel,
  type PObjectId,
  type PTableColumnId,
  pTableValue,
} from '@platforma-sdk/model';
import { computedAsync } from '@vueuse/core';
import { type MaybeRefOrGetter, ref, shallowRef, toValue } from 'vue';
import { type Markup, markupAlignedSequence, parseMarkup } from './markup';
import { multiSequenceAlignment } from './multi-sequence-alignment';

const getPFrameDriver = () => getRawPlatformaInstance().pFrameDriver;

export const sequenceLimit = 1000;

export function useSequenceColumnsOptions(
  params: MaybeRefOrGetter<{
    pFrame: PFrameHandle | undefined;
    sequenceColumnPredicate: PColumnPredicate;
  }>,
) {
  const error = shallowRef<Error>();
  const data = computedAsync(
    async () => {
      try {
        error.value = undefined;
        return await getSequenceColumnsOptions(toValue(params));
      } catch (err) {
        error.value = ensureError(err);
        return { options: [], defaults: [] };
      }
    },
    { options: [], defaults: [] },
  );
  return { data, error };
}

export function useLabelColumnsOptions(
  params: MaybeRefOrGetter<{
    pFrame: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnOptionPredicate:
      | ((column: PColumnIdAndSpec) => boolean)
      | undefined;
  }>,
) {
  const error = shallowRef<Error>();
  const data = computedAsync(
    async () => {
      try {
        error.value = undefined;
        return await getLabelColumnsOptions(toValue(params));
      } catch (err) {
        console.error(err);
        error.value = ensureError(err);
        return { options: [], defaults: [] };
      }
    },
    { options: [], defaults: [] },
  );
  return { data, error };
}

export function useMarkupColumnsOptions(
  params: MaybeRefOrGetter<{
    pFrame: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
  }>,
) {
  const error = shallowRef<Error>();
  const data = computedAsync(
    async () => {
      try {
        error.value = undefined;
        return await getMarkupColumnsOptions(toValue(params));
      } catch (err) {
        console.error(err);
        error.value = ensureError(err);
        return [];
      }
    },
    [],
  );
  return { data, error };
}

export function useMultipleAlignmentData(
  params: MaybeRefOrGetter<{
    pframe: PFrameHandle | undefined;
    sequenceColumnIds: PObjectId[];
    labelColumnIds: PTableColumnId[];
    markupColumnId: PObjectId | undefined;
    linkerColumnPredicate: PColumnPredicate | undefined;
    selection: PlSelectionModel | undefined;
  }>,
) {
  const loading = ref(true);
  const error = shallowRef<Error>();
  const data = computedAsync(
    async () => {
      try {
        error.value = undefined;
        return await getMultipleAlignmentData(toValue(params));
      } catch (err) {
        console.error(err);
        error.value = ensureError(err);
        return { sequences: [], labels: [] };
      }
    },
    { sequences: [], labels: [] },
    { evaluating: loading },
  );
  return { data, error, loading };
}

async function getSequenceColumnsOptions({
  pFrame,
  sequenceColumnPredicate,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnPredicate: (column: PColumnIdAndSpec) => boolean;
}): Promise<OptionsWithDefaults<PObjectId>> {
  if (!pFrame) return { options: [], defaults: [] };
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const options = columns
    .filter((column) => sequenceColumnPredicate(column))
    .map(({ spec, columnId }) => ({
      label: spec.annotations?.['pl7.app/label'] ?? 'Unlabelled column',
      value: columnId,
    }));
  const defaults = options.map(({ value }) => value);
  return { options, defaults };
}

async function getLabelColumnsOptions({
  pFrame,
  sequenceColumnIds,
  labelColumnOptionPredicate,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[];
  labelColumnOptionPredicate:
    | ((column: PColumnIdAndSpec) => boolean)
    | undefined;
}): Promise<OptionsWithDefaults<PTableColumnId>> {
  if (!pFrame) return { options: [], defaults: [] };
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const optionMap = new Map<CanonicalizedJson<PTableColumnId>, string>();
  for (const column of columns) {
    if (sequenceColumnIds.includes(column.columnId)) {
      for (const axisSpec of column.spec.axesSpec) {
        const axisId = getAxisId(axisSpec);
        const axisIdJson = canonicalizeJson({ type: 'axis', id: axisId });
        if (optionMap.has(axisIdJson)) continue;
        const labelColumn = columns.find(
          ({ spec }) =>
            isLabelColumn(spec)
            && matchAxisId(axisId, getAxisId(spec.axesSpec[0])),
        );
        optionMap.set(
          labelColumn
            ? canonicalizeJson({ type: 'column', id: labelColumn.columnId })
            : axisIdJson,
          axisSpec.annotations?.['pl7.app/label'] ?? 'Unlabelled axis',
        );
      }
    }
    if (labelColumnOptionPredicate?.(column)) {
      optionMap.set(
        canonicalizeJson({ type: 'column', id: column.columnId }),
        column.spec.annotations?.['pl7.app/label'] ?? 'Unlabelled column',
      );
    }
  }
  const options = Array.from(optionMap).map(
    ([value, label]) => ({ label, value: parseJson(value) }),
  );
  const defaults = options
    .filter(({ value }) => {
      if (value.type === 'axis') return true;
      const column = columns.find(({ columnId }) => columnId === value.id);
      return column && isLabelColumn(column.spec);
    })
    .map(({ value }) => value);
  return { options, defaults };
}

async function getMarkupColumnsOptions({
  pFrame,
  sequenceColumnIds,
}: {
  pFrame: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[];
}): Promise<ListOptionNormalized<PObjectId>[]> {
  if (!pFrame || sequenceColumnIds.length !== 1) return [];
  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pFrame);
  const sequenceColumn = columns.find((column) =>
    column.columnId === sequenceColumnIds[0],
  );
  if (!sequenceColumn) {
    throw new Error(
      `Couldn't find sequence column (ID: ${sequenceColumnIds[0]})`,
    );
  }
  return columns
    .filter((column) =>
      column.spec.annotations?.['pl7.app/sequence/isAnnotation'] === 'true'
      && isJsonEqual(sequenceColumn.spec.axesSpec, column.spec.axesSpec)
      && Object.entries(sequenceColumn.spec.domain ?? {}).every((
        [key, value],
      ) => column.spec.domain?.[key] === value),
    ).map(({ columnId, spec }) => ({
      value: columnId,
      label: spec.annotations?.['pl7.app/label'] ?? 'Unlabelled column',
    }));
}

async function getMultipleAlignmentData({
  pframe,
  sequenceColumnIds,
  labelColumnIds,
  markupColumnId,
  linkerColumnPredicate,
  selection,
}: {
  pframe: PFrameHandle | undefined;
  sequenceColumnIds: PObjectId[];
  labelColumnIds: PTableColumnId[];
  markupColumnId: PObjectId | undefined;
  linkerColumnPredicate: PColumnPredicate | undefined;
  selection: PlSelectionModel | undefined;
}): Promise<MultipleAlignmentData> {
  if (!pframe || sequenceColumnIds.length === 0) {
    return { sequences: [], labels: [] };
  }

  const pFrameDriver = getPFrameDriver();
  const columns = await pFrameDriver.listColumns(pframe);
  const linkerColumns = linkerColumnPredicate
    ? columns.filter((c) => linkerColumnPredicate(c))
    : [];

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
  if (markupColumnId) {
    secondaryEntry.push({ type: 'column', column: markupColumnId });
  }

  const request: CalculateTableDataRequest<PObjectId> = {
    src: {
      type: 'outer',
      primary: primaryEntry,
      secondary: secondaryEntry,
    },
    filters: [],
    sorting: sequenceColumnIds.map((id) => ({
      column: {
        type: 'column',
        id,
      },
      ascending: true,
      naAndAbsentAreLeastValues: true,
    })),
  };

  const table = await pFrameDriver.calculateTableData(
    pframe,
    JSON.parse(JSON.stringify(request)),
    {
      offset: 0,
      length: sequenceLimit,
    },
  );

  const rowCount = table?.[0].data.data.length ?? 0;

  const sequenceColumns = sequenceColumnIds.map((columnId) => {
    const column = table.find(({ spec }) => spec.id === columnId);
    if (!column) {
      throw new Error(
        `Can't find a sequence column (ID: \`${columnId}\`) in the calculateTableData output.`,
      );
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
      throw new Error(
        `Can't find a label column (ID: \`${labelColumn}\`) in the calculateTableData output.`,
      );
    }
    return column;
  });

  const markupColumn = markupColumnId
    && table.find(({ spec }) => spec.id === markupColumnId);

  const alignedSequences = await Promise.all(
    sequenceColumns.map((column) =>
      multiSequenceAlignment(Array.from(
        { length: rowCount },
        (_, row) =>
          pTableValue(column.data, row, { na: '', absent: '' })?.toString()
          ?? '',
      )),
    ),
  );

  const sequences = Array.from(
    { length: rowCount },
    (_, row) => alignedSequences.map((column) => column[row]),
  );

  const labels = Array.from(
    { length: rowCount },
    (_, row) =>
      labelColumns.map((column) =>
        pTableValue(column.data, row, { na: '', absent: '' })?.toString() ?? '',
      ),
  );

  const result: MultipleAlignmentData = { sequences, labels };

  if (markupColumn) {
    const labels = JSON.parse(
      markupColumn.spec.spec.annotations
        ?.['pl7.app/sequence/annotation/mapping'] ?? '{}',
    );
    const data = Array.from(
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
    result.markup = { labels, data };
  }

  return result;
}

type MultipleAlignmentData = {
  sequences: string[][];
  labels: string[][];
  markup?: {
    labels: Record<string, string>;
    data: Markup[];
  };
};

type OptionsWithDefaults<T> = {
  options: ListOptionNormalized<T>[];
  defaults: T[];
};
