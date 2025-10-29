import type { FilterSpec, ValueType } from '@platforma-sdk/model';
import { assertNever, type AxisSpec, type PColumnSpec, type SUniversalPColumnId } from '@platforma-sdk/model';
import { isSupportedFilterType, type Filter, type FilterType, type Group, type PlAdvancedFilterUI, type SupportedFilterTypes } from './types';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, SUPPORTED_FILTER_TYPES } from './constants';
import { filterUiMetadata } from '@milaboratories/uikit';

function toInnerFilter(outerFilter: FilterSpec): Filter | null {
  if (!('column' in outerFilter) || outerFilter.type === undefined || !isSupportedFilterType(outerFilter.type)) {
    return null;
  }
  if (outerFilter.type === 'patternFuzzyContainSubsequence') {
    return {
      ...outerFilter,
      value: outerFilter.value,
      wildcard: outerFilter.wildcard,
      maxEdits: outerFilter.maxEdits ?? 2,
      substitutionsOnly: outerFilter.substitutionsOnly ?? false,
    };
  }

  return { ...outerFilter } as Filter;
}

let groupIdCounter = 0;
function getNewGroupId() {
  groupIdCounter++;
  return String(groupIdCounter);
}

function toInnerFiltersGroup(f: FilterSpec): Group | null {
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

export function toInnerModel(m: FilterSpec): PlAdvancedFilterUI {
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

function toOuterFilter(filter: Filter): FilterSpec | null {
  if (
    filter.type === 'isNA' || filter.type === 'isNotNA'
    || filter.type === 'inSet' || filter.type === 'notInSet'
  ) {
    return filter;
  }
  if (
    filter.type === 'greaterThanOrEqual' || filter.type === 'lessThanOrEqual'
    || filter.type === 'greaterThan' || filter.type === 'lessThan'
    || filter.type === 'equal' || filter.type === 'notEqual'
  ) {
    return filter.x !== undefined ? { ...filter, x: filter.x } : null;
  }
  if (
    filter.type === 'patternEquals' || filter.type === 'patternNotEquals'
    || filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence'
    || filter.type === 'patternMatchesRegularExpression'
    || filter.type === 'patternFuzzyContainSubsequence'
  ) {
    return filter.value !== undefined ? { ...filter, value: filter.value } : null;
  }
  assertNever(filter.type);
  return null;
}

function toOuterFilterGroup(m: Group): FilterSpec {
  const res: FilterSpec = {
    type: m.operand,
    filters: m.filters.map(toOuterFilter).filter((v): v is FilterSpec => v !== null),
  };
  if (m.not) {
    return {
      type: 'not',
      filter: res,
    } as FilterSpec;
  }
  return res;
}
export function toOuterModel(m: PlAdvancedFilterUI): FilterSpec {
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
  return filterUiMetadata[filterType as keyof typeof filterUiMetadata];
}
