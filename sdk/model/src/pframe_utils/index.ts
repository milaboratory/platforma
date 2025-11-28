import { flatten, uniq } from 'es-toolkit';

import type {
  AxisSpec,
  CalculateTableDataRequest,
  PColumnSpec,
  PFrameHandle,
  PTableVector,
  UniqueValuesRequest,
  AxisId,
  CanonicalizedJson,
  FindColumnsRequest,
  FindColumnsResponse,
  FullPTableColumnData,
  PColumnIdAndSpec,
  PObjectId,
  PTableRecordSingleValueFilterV2,
  ValueType,
} from '@milaboratories/pl-model-common';
import { pTableValue, Annotation, canonicalizeAxisId, getAxisId, readAnnotation, PColumnName } from '@milaboratories/pl-model-common';

// Types
type PValue = string | number | null;

type SuggestionResponse = {
  values: {
    value: string;
    label: string;
  }[];
  overflow: boolean;
};

type SingleColumnData = {
  axesData: Record<string, PValue[]>;
  data: PValue[];
};

type UniqueValuesResponse = {
  values: string[];
  overflow: boolean;
};

type GetUniqueSourceValuesParams = {
  columnId: PObjectId;
  axisIdx?: number;
  limit?: number;
  searchQuery?: string;
  searchQueryValue?: string;
};

type GetAxisUniqueValuesParams = {
  axisId: AxisId;
  parentColumnIds: PObjectId[];
  limit?: number;
  filters?: PTableRecordSingleValueFilterV2[];
};

type GetColumnsFullParams = {
  selectedSources: PObjectId[];
  strictlyCompatible: boolean;
  types?: ValueType[];
  names?: string[];
  annotations?: FindColumnsRequest['columnFilter']['annotationValue'];
  annotationsNotEmpty?: string[];
};

// Constants
const UNIQUE_VALUES_LIMIT = 1000000;

// Helper functions
const sortValuesPredicate = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, 'en', { numeric: true });

function convertColumnData(type: ValueType, response: PTableVector, absentValue: number | null = null): PValue[] {
  if (type === 'String') {
    return response.data as PValue[];
  }
  const res: PValue[] = new Array(response.data.length);
  for (let i = 0; i < response.data.length; i++) {
    res[i] = pTableValue(response, i, { absent: absentValue, na: null }) as PValue;
  }
  return res;
}

function createSearchFilter(
  columnId: PObjectId,
  substring: string,
): PTableRecordSingleValueFilterV2 {
  return {
    type: 'bySingleColumnV2',
    column: {
      type: 'column',
      id: columnId,
    },
    predicate: {
      operator: 'StringIContains',
      substring,
    },
  };
}

function createAxisSearchFilter(
  axisSpec: AxisSpec,
  substring: string,
): PTableRecordSingleValueFilterV2 {
  return {
    type: 'bySingleColumnV2',
    column: {
      type: 'axis',
      id: {
        type: axisSpec.type,
        name: axisSpec.name,
      },
    },
    predicate: {
      operator: 'StringIContains',
      substring,
    },
  };
}

function mapValuesToSuggestions(values: string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: String(v), label: String(v) })).sort(sortValuesPredicate);
}

function getPFrameDriver() {
  if (typeof platforma === 'undefined') {
    throw new Error('Platforma instance is not available');
  }
  if (typeof platforma.pFrameDriver === 'undefined') {
    throw new Error('PFrame driver is not available in the current Platforma instance');
  }
  return platforma.pFrameDriver;
}

// Core functions
export async function getColumnSpecById(handle: PFrameHandle, id: PObjectId): Promise<PColumnSpec | null> {
  try {
    const response = await getPFrameDriver().getColumnSpec(handle, id);
    return response ?? null;
  } catch (err) {
    console.error('PFrame: get single column error', err);
    return null;
  }
}

export async function getSingleColumnData(
  handle: PFrameHandle,
  id: PObjectId,
  filters: PTableRecordSingleValueFilterV2[] = [],
): Promise<SingleColumnData> {
  try {
    const response: FullPTableColumnData[] = await getPFrameDriver().calculateTableData(handle, {
      src: {
        type: 'column',
        column: id,
      },
      filters,
      sorting: [],
    } as CalculateTableDataRequest<PObjectId>);

    const axes = response.filter((item) => item.spec.type === 'axis');
    const columns = response.filter((item) => item.spec.type === 'column');

    return {
      axesData: axes.reduce((res: Record<string, PValue[]>, item) => {
        const id = getAxisId(item.spec.spec as AxisSpec);
        res[canonicalizeAxisId(id)] = convertColumnData(id.type, item.data);
        return res;
      }, {}),
      data: columns.length ? convertColumnData(columns[0].data.type, columns[0].data) : [],
    };
  } catch (err) {
    console.error('PFrame: calculateTableData error');
    throw err;
  }
}

export async function getColumnUniqueValues(
  handle: PFrameHandle,
  id: PObjectId,
  limit = UNIQUE_VALUES_LIMIT,
  filters: PTableRecordSingleValueFilterV2[] = [],
): Promise<UniqueValuesResponse> {
  const request: UniqueValuesRequest = {
    columnId: id,
    filters,
    limit,
  };

  try {
    const response = await getPFrameDriver().getUniqueValues(handle, request);
    if (response.overflow) {
      console.warn(`More than ${limit} values for ${id} column`);
    }
    return {
      values: Array.from(response.values.data as ArrayLike<unknown>).map(String),
      overflow: response.overflow,
    };
  } catch (err) {
    console.error('PFrame: getUniqueValues for column error');
    throw err;
  }
}

export async function getAxisUniqueValues(
  handle: PFrameHandle,
  params: GetAxisUniqueValuesParams,
): Promise<UniqueValuesResponse> {
  const { axisId, parentColumnIds, limit = UNIQUE_VALUES_LIMIT, filters = [] } = params;
  const strAxisId = canonicalizeAxisId(axisId);

  const parentsSpecs = (await Promise.all(parentColumnIds.map((p) => getColumnSpecById(handle, p))))
    .flatMap((spec, i): [PObjectId, PColumnSpec][] =>
      spec != null && spec.kind === 'PColumn' ? [[parentColumnIds[i], spec]] : [],
    )
    .filter(([_, spec]) =>
      spec.axesSpec.some((axisSpec) => canonicalizeAxisId(getAxisId(axisSpec)) === strAxisId),
    );

  if (parentsSpecs.length === 0) {
    console.warn('Axis unique values requested without parent columns');
    return { values: [], overflow: false };
  }

  try {
    const responses = await Promise.all(
      parentsSpecs.map(([id]) =>
        getPFrameDriver().getUniqueValues(handle, {
          columnId: id,
          axis: axisId,
          filters,
          limit,
        }),
      ),
    );

    const overflow = responses.some((r) => r.overflow);
    return {
      values: uniq(
        flatten(responses.map((r) =>
          Array.from(r.values.data as ArrayLike<unknown>).map(String),
        )),
      ),
      overflow,
    };
  } catch (err) {
    console.error('PFrame: getUniqueValues for axis error', err);
    return { values: [], overflow: false };
  }
}

export async function getRequestColumnsFromSelectedSources(
  handle: PFrameHandle,
  sources: PObjectId[],
): Promise<AxisId[]> {
  const result: AxisId[] = [];
  for (const item of sources) {
    const spec = await getColumnSpecById(handle, item);
    if (spec?.kind === 'PColumn') {
      result.push(...spec.axesSpec.map((spec) => getAxisId(spec)));
    }
  }
  return result;
}

export async function getColumnsFull(
  handle: PFrameHandle,
  params: GetColumnsFullParams,
): Promise<PColumnIdAndSpec[]> {
  const { selectedSources, strictlyCompatible, types, names, annotations, annotationsNotEmpty } = params;

  try {
    const request: FindColumnsRequest = {
      columnFilter: {
        type: types,
        name: names,
        annotationValue: annotations,
        annotationPattern: annotationsNotEmpty?.reduce((res, v) => {
          res[v] = '.+';
          return res;
        }, {} as Record<string, string>),
      },
      compatibleWith: await getRequestColumnsFromSelectedSources(handle, selectedSources),
      strictlyCompatible,
    };

    const response: FindColumnsResponse = await getPFrameDriver().findColumns(handle, request);
    return response.hits;
  } catch (err) {
    console.error('PFrame: findColumns error');
    throw err;
  }
}

export async function getColumnOrAxisValueLabelsId(
  handle: PFrameHandle,
  strAxisId: CanonicalizedJson<AxisId>,
): Promise<PObjectId | undefined> {
  const labelColumns = await getColumnsFull(handle, {
    selectedSources: [],
    strictlyCompatible: false,
    names: [PColumnName.Label],
  });

  const labelColumn = labelColumns.find(({ spec }) => {
    return spec && spec.axesSpec.length === 1 && canonicalizeAxisId(spec.axesSpec[0]) === strAxisId;
  });

  return labelColumn?.columnId;
}

function getDiscreteValuesFromAnnotation(columnSpec: PColumnSpec): undefined | SuggestionResponse {
  const discreteValuesStr = readAnnotation(columnSpec, Annotation.DiscreteValues);
  if (!discreteValuesStr) {
    return undefined;
  }

  try {
    const discreteValues: string[] = (JSON.parse(discreteValuesStr) as (string | number)[]).map((v) => String(v));
    const values = discreteValues.map((v) => ({ value: v, label: v })).sort(sortValuesPredicate);
    return { values, overflow: false };
  } catch {
    console.error(`Parsing error: discrete values annotation ${discreteValuesStr}`);
    return undefined;
  }
}

async function getAxisValuesWithLabels(
  handle: PFrameHandle,
  params: {
    columnId: PObjectId;
    axisSpec: AxisSpec;
    labelsColumnId: PObjectId | undefined;
    limit?: number;
    searchQuery?: string;
    searchQueryValue?: string;
  },
): Promise<SuggestionResponse> {
  const { columnId, axisSpec, labelsColumnId, limit, searchQuery, searchQueryValue } = params;
  const strAxisId = canonicalizeAxisId(getAxisId(axisSpec));

  let filters: PTableRecordSingleValueFilterV2[] = [];

  if (labelsColumnId) {
    if (searchQuery) {
      filters = [createSearchFilter(labelsColumnId, searchQuery)];
    }
    if (searchQueryValue) {
      filters = [createAxisSearchFilter(axisSpec, searchQueryValue)];
    }

    const { data: dataValues, axesData } = await getSingleColumnData(handle, labelsColumnId, filters);
    const axisKeys = axesData[strAxisId];
    const values: { value: string; label: string }[] = [];

    for (let i = 0; i < Math.min(axisKeys.length, limit ?? axisKeys.length); i++) {
      values.push({ value: String(axisKeys[i]), label: String(dataValues[i]) });
    }

    values.sort(sortValuesPredicate);
    return { values, overflow: !(limit === undefined || axisKeys.length < limit) };
  } else {
    const searchInLabelsOrValue = searchQuery ?? searchQueryValue;
    if (searchInLabelsOrValue) {
      filters = [createAxisSearchFilter(axisSpec, searchInLabelsOrValue)];
    }

    const response = await getAxisUniqueValues(handle, {
      axisId: getAxisId(axisSpec),
      parentColumnIds: [columnId],
      limit,
      filters,
    });

    const values = mapValuesToSuggestions(response.values);
    return { values, overflow: response.overflow };
  }
}

async function getColumnValuesWithLabels(
  handle: PFrameHandle,
  params: {
    columnId: PObjectId;
    limit?: number;
    searchQuery?: string;
    searchQueryValue?: string;
  },
): Promise<SuggestionResponse> {
  const { columnId, limit, searchQuery, searchQueryValue } = params;
  const searchInLabelsOrValue = searchQuery ?? searchQueryValue;

  const filters: PTableRecordSingleValueFilterV2[] = searchInLabelsOrValue
    ? [createSearchFilter(columnId, searchInLabelsOrValue)]
    : [];

  const response = await getColumnUniqueValues(handle, columnId, limit, filters);
  const values = mapValuesToSuggestions(response.values);
  return { values, overflow: response.overflow };
}

export async function getUniqueSourceValuesWithLabels(
  handle: PFrameHandle,
  params: GetUniqueSourceValuesParams,
): Promise<SuggestionResponse> {
  const { columnId, axisIdx, limit, searchQuery, searchQueryValue } = params;

  const selectedSourceSpec = await getColumnSpecById(handle, columnId);
  if (selectedSourceSpec == null || selectedSourceSpec.kind !== 'PColumn') {
    return { values: [], overflow: false };
  }

  // Try to get discrete values from annotation
  const discreteValues = getDiscreteValuesFromAnnotation(selectedSourceSpec);
  if (discreteValues != null) {
    return discreteValues;
  }

  // Handle axis values
  if (axisIdx != null) {
    const axisSpec = selectedSourceSpec.axesSpec[axisIdx];
    const strAxisId = canonicalizeAxisId(getAxisId(axisSpec));
    const labelsColumnId = await getColumnOrAxisValueLabelsId(handle, strAxisId);

    return getAxisValuesWithLabels(handle, {
      columnId,
      axisSpec,
      labelsColumnId,
      limit,
      searchQuery,
      searchQueryValue,
    });
  }

  // Handle column values
  return getColumnValuesWithLabels(handle, {
    columnId,
    limit,
    searchQuery,
    searchQueryValue,
  });
}
