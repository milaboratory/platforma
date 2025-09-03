import type { ValueType } from '@platforma-sdk/model';
import { filterUiMetadata, type AxisSpec, type FilterUi, type PColumnSpec, type SUniversalPColumnId } from '@platforma-sdk/model';
import type { Filter, FilterType, Group, PlAdvancedFilterUI, SupportedFilterTypes } from './types';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, LOCAL_FILTERS_METADATA, SUPPORTED_FILTER_TYPES } from './constants';

function toInnerFilter(filter: FilterUi): Filter | null {
  if (filter.type === 'isNA' || filter.type === 'isNotNA') {
    return {
      type: filter.type,
      sourceId: filter.column,
    };
  }
  if (
    filter.type === 'greaterThan' || filter.type === 'greaterThanOrEqual'
    || filter.type === 'lessThan' || filter.type === 'lessThanOrEqual'
  ) {
    return {
      type: filter.type,
      reference: filter.x,
      sourceId: filter.column,
    };
  }
  if (filter.type === 'patternEquals' || filter.type === 'patternNotEquals') {
    return {
      type: filter.type,
      reference: filter.value,
      sourceId: filter.column,
    };
  }
  if (filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence') {
    return {
      type: filter.type,
      substring: filter.value,
      sourceId: filter.column,
    };
  }
  if (filter.type === 'patternFuzzyContainSubsequence') {
    return {
      type: filter.type,
      reference: filter.value,
      wildcard: filter.wildcard,
      maxEdits: filter.maxEdits ?? 2,
      substitutionsOnly: filter.substitutionsOnly ?? false,
      sourceId: filter.column,
    };
  }
  if (filter.type === 'or' && filter.filters.every((f) => f.type === 'patternEquals')) { // different possible structures?
    const columnIds = new Set(filter.filters.map((f) => f.column));
    if (columnIds.size === 1) {
      return {
        type: 'InSet',
        reference: filter.filters.map((f) => f.value),
        sourceId: filter.filters[0].column,
      };
    }
  }
  if (filter.type === 'not') { // different possible structures?
    const f = toInnerFilter(filter.filter);
    if (f?.type === 'InSet') {
      return {
        type: 'NotInSet',
        reference: f.reference,
        sourceId: f.sourceId,
      };
    }
  }
  return null;
}

let groupIdCounter = 0;
function getNewGroupId() {
  groupIdCounter++;
  return String(groupIdCounter);
}

function toInnerFiltersGroup(f: FilterUi): Group | null {
  if (f.type === 'not') {
    const group = toInnerFiltersGroup(f.filter);
    return group
      ? {
          not: !group.not,
          operand: group.operand,
          filters: group.filters,
          id: getNewGroupId(),
        }
      : null;
  }
  if (f.type === 'and' || f.type === 'or') {
    return {
      operand: f.type,
      not: false,
      filters: f.filters.map((f) => toInnerFilter(f)).filter((v) => v !== null) as Filter[],
      id: getNewGroupId(),
    };
  }
  if (SUPPORTED_FILTER_TYPES.has(f.type as SupportedFilterTypes)) {
    const filter = toInnerFilter(f);
    return {
      operand: 'or',
      not: false,
      filters: filter ? [filter] : [],
      id: getNewGroupId(),
    };
  }
  return null;
}

export function toInnerModel(m: FilterUi): PlAdvancedFilterUI {
  const res: PlAdvancedFilterUI = {
    operand: 'or',
    groups: [],
  };
  if (m.type === 'not') {
    return res; // not supported 'not' for all the groups in ui
  }
  if (m.type === 'and' || m.type === 'or') {
    // group
    res.operand = m.type;
    res.groups = m.filters.map(toInnerFiltersGroup).filter((v) => v !== null) as Group[];
  } else if (SUPPORTED_FILTER_TYPES.has(m.type as SupportedFilterTypes)) {
    // single filter
    const group = toInnerFiltersGroup(m);
    res.groups = group ? [group] : [];
  }
  res.groups = res.groups.filter((gr) => gr.filters.length > 0);
  return res;
}

function toOuterFilter(filter: Filter): FilterUi | null {
  const column = filter.sourceId as SUniversalPColumnId;
  if (filter.type === 'isNA' || filter.type === 'isNotNA') {
    return {
      type: filter.type,
      column,
    };
  }
  if (
    filter.type === 'greaterThan' || filter.type === 'lessThan'
    || filter.type === 'greaterThanOrEqual' || filter.type === 'lessThanOrEqual'
  ) {
    return filter.reference !== undefined
      ? {
          type: filter.type,
          x: filter.reference,
          column,
        }
      : null;
  }
  if (filter.type === 'patternEquals' || filter.type === 'patternNotEquals') {
    return filter.reference !== undefined
      ? {
          type: filter.type,
          value: filter.reference,
          column,
        }
      : null;
  }
  if (filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence') {
    return {
      type: filter.type,
      value: filter.substring,
      column,
    };
  }
  if (filter.type === 'InSet') {
    return filter.reference.length
      ? {
          type: 'or',
          filters: filter.reference.map((v) => ({
            type: 'patternEquals',
            value: v,
            column,
          })),
        }
      : null;
  }
  if (filter.type === 'NotInSet') {
    return filter.reference.length
      ? {
          type: 'not',
          filter: {
            type: 'or',
            filters: filter.reference.map((v) => ({
              type: 'patternEquals',
              value: v,
              column,
            })),
          },
        }
      : null;
  }
  return null;
}

function toOuterFilterGroup(m: Group): FilterUi {
  const res: FilterUi = {
    type: m.operand,
    filters: m.filters.map(toOuterFilter).filter((v) => v !== null),
  };
  if (m.not) {
    return {
      type: 'not',
      filter: res,
    };
  }
  return res;
}
export function toOuterModel(m: PlAdvancedFilterUI): FilterUi {
  return {
    type: m.operand,
    filters: m.groups.map(toOuterFilterGroup),
  };
}

export function createNewGroup(selectedSourceId: string) {
  return {
    id: getNewGroupId(),
    not: false,
    operand: 'and' as const,
    filters: [{
      ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
      sourceId: selectedSourceId,
    }],
  };
}

export type NormalizedSpecData = {
  valueType: ValueType;
  annotations: PColumnSpec['annotations'];
  domain: PColumnSpec['domain'];
};
export function getNormalizedSpec(spec: PColumnSpec | AxisSpec): NormalizedSpecData {
  const valueType = 'kind' in spec ? spec.valueType : spec.type;
  return { valueType, annotations: spec.annotations, domain: spec.domain };
}

export function isNumericValueType(spec?: PColumnSpec | AxisSpec): boolean {
  if (!spec) {
    return false;
  }
  const valueType = getNormalizedSpec(spec).valueType;
  return valueType === 'Int' || valueType === 'Long' || valueType === 'Float' || valueType === 'Double';
}

export function isStringValueType(spec?: PColumnSpec | AxisSpec): boolean {
  if (!spec) {
    return false;
  }
  const valueType = getNormalizedSpec(spec).valueType;
  return valueType === 'String';
}

export function getFilterInfo(filterType: FilterType): { label: string; supportedFor: (spec: NormalizedSpecData) => boolean } {
  if (filterType === 'InSet' || filterType === 'NotInSet') {
    return LOCAL_FILTERS_METADATA[filterType];
  }
  return filterUiMetadata[filterType as keyof typeof filterUiMetadata];
}
