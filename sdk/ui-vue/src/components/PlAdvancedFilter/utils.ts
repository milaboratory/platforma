import type { ValueType } from '@platforma-sdk/model';
import { filterUiMetadata, type AxisSpec, type FilterUi, type PColumnSpec, type SUniversalPColumnId } from '@platforma-sdk/model';
import type { Filter, FilterType, Group, PlAdvancedFilterUI, SupportedFilterTypes } from './types';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, LOCAL_FILTERS_METADATA, SUPPORTED_FILTER_TYPES } from './constants';

function toInnerFilter(filter: FilterUi): Filter | null {
  if (
    filter.type === 'isNA' || filter.type === 'isNotNA'
    || filter.type === 'greaterThan' || filter.type === 'greaterThanOrEqual'
    || filter.type === 'lessThan' || filter.type === 'lessThanOrEqual'
    || filter.type === 'patternEquals' || filter.type === 'patternNotEquals'
    || filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence'
  ) {
    return filter;
  }
  if (filter.type === 'patternFuzzyContainSubsequence') {
    return {
      type: filter.type,
      value: filter.value,
      wildcard: filter.wildcard,
      maxEdits: filter.maxEdits ?? 2,
      substitutionsOnly: filter.substitutionsOnly ?? false,
      column: filter.column,
    };
  }
  if (filter.type === 'or' && filter.filters.every((f) => f.type === 'patternEquals')) { // different possible structures?
    const columnIds = new Set(filter.filters.map((f) => f.column));
    if (columnIds.size === 1) {
      return {
        type: 'inSet',
        value: filter.filters.map((f) => f.value),
        column: filter.filters[0].column,
      };
    }
  }
  if (filter.type === 'not') { // different possible structures?
    const f = toInnerFilter(filter.filter);
    if (f?.type === 'inSet') {
      return {
        type: 'notInSet',
        value: f.value,
        column: f.column,
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
  const column = filter.column;
  if (filter.type === 'isNA' || filter.type === 'isNotNA') {
    return filter;
  }
  if (
    filter.type === 'greaterThanOrEqual' || filter.type === 'lessThanOrEqual'
    || filter.type === 'greaterThan' || filter.type === 'lessThan'
    || filter.type === 'numberEquals' || filter.type === 'numberNotEquals'
  ) {
    return filter.x !== undefined ? { ...filter, x: filter.x } : null;
  }
  if (
    filter.type === 'patternEquals' || filter.type === 'patternNotEquals'
    || filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence'
  ) {
    return filter.value !== undefined ? filter : null;
  }
  if (filter.type === 'inSet') {
    return filter.value.length
      ? {
          type: 'or',
          filters: filter.value.map((v) => ({
            type: 'patternEquals',
            value: v,
            column,
          })),
        }
      : null;
  }
  if (filter.type === 'notInSet') {
    return filter.value.length
      ? {
          type: 'not',
          filter: {
            type: 'or',
            filters: filter.value.map((v) => ({
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
    filters: m.filters.map(toOuterFilter).filter((v): v is FilterUi => v !== null),
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
      column: selectedSourceId as SUniversalPColumnId,
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
  if (filterType === 'inSet' || filterType === 'notInSet') {
    return LOCAL_FILTERS_METADATA[filterType];
  }
  return filterUiMetadata[filterType as keyof typeof filterUiMetadata];
}
