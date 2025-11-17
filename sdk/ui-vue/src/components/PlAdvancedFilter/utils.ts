import type { AnchoredPColumnId, AxisId, CanonicalizedJson, FilteredPColumnId, ValueType } from '@platforma-sdk/model';
import { assertNever, getTypeFromPColumnOrAxisSpec, isAnchoredPColumnId, isFilteredPColumn, parseJson, type AxisSpec, type PColumnSpec, type SUniversalPColumnId } from '@platforma-sdk/model';
import { type CommonFilterSpec, isSupportedFilterType, type Filter, type FilterType, type Group, type PlAdvancedFilterUI, type SupportedFilterTypes, type PlAdvancedFilterColumnId } from './types';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, SUPPORTED_FILTER_TYPES } from './constants';
import { filterUiMetadata } from '@milaboratories/uikit';
import { ref, watch, type ModelRef } from 'vue';
import { isAxisId } from '@platforma-sdk/model';

function toInnerFilter(outerFilter: CommonFilterSpec): Filter | null {
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

function toInnerFiltersGroup(f: CommonFilterSpec): Group | null {
  if (f.type === 'not') {
    const group = toInnerFiltersGroup(f.filter);
    return group
      ? {
          not: !group.not,
          operand: group.operand,
          filters: group.filters,
          id: getNewGroupId(),
          expanded: group.expanded,
        }
      : null;
  }
  if (f.type === 'and' || f.type === 'or') {
    return {
      operand: f.type,
      not: false,
      filters: f.filters.map((f) => toInnerFilter(f)).filter((v) => v !== null) as Filter[],
      id: getNewGroupId(),
      expanded: f.expanded ?? true,
    };
  }
  if (SUPPORTED_FILTER_TYPES.has(f.type as SupportedFilterTypes)) {
    const filter = toInnerFilter(f);
    return {
      operand: 'or',
      not: false,
      filters: filter ? [filter] : [],
      id: getNewGroupId(),
      expanded: f.expanded ?? true,
    };
  }
  return null;
}

export function toInnerModel(m: CommonFilterSpec): PlAdvancedFilterUI {
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

function toOuterFilter(filter: Filter): CommonFilterSpec | null {
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
}

function toOuterFilterGroup(m: Group): CommonFilterSpec {
  const res: CommonFilterSpec = {
    type: m.operand,
    expanded: m.expanded,
    filters: m.filters.map(toOuterFilter).filter((v): v is CommonFilterSpec => v !== null),
  };
  if (m.not) {
    return {
      type: 'not',
      filter: res,
    } as CommonFilterSpec;
  }
  return res;
}
export function toOuterModel(m: PlAdvancedFilterUI): CommonFilterSpec {
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
    expanded: true,
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
  return { valueType: getTypeFromPColumnOrAxisSpec(spec), annotations: spec.annotations, domain: spec.domain };
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

export function isNumericFilter(filter: Filter): filter is Filter & { type: 'equal' | 'notEqual' | 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' } {
  return filter.type === 'equal' || filter.type === 'notEqual' || filter.type === 'lessThan' || filter.type === 'lessThanOrEqual' || filter.type === 'greaterThan' || filter.type === 'greaterThanOrEqual';
}
export function isStringFilter(filter: Filter): filter is Filter & { type: 'patternEquals' | 'patternNotEquals' | 'patternContainSubsequence' | 'patternNotContainSubsequence' | 'patternMatchesRegularExpression' | 'patternFuzzyContainSubsequence' } {
  return filter.type === 'patternEquals' || filter.type === 'patternNotEquals' || filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence' || filter.type === 'patternMatchesRegularExpression' || filter.type === 'patternFuzzyContainSubsequence';
}

export function getFilterInfo(filterType: FilterType): { label: string; supportedFor: (spec: NormalizedSpecData) => boolean } {
  return filterUiMetadata[filterType as keyof typeof filterUiMetadata];
}

export function useInnerModel<T, V>(
  toInnerModel: (v: T) => V,
  toOuterModel: (v: V) => T,
  model: ModelRef<T>,
) {
  const innerModel = ref<V>(toInnerModel(model.value));
  function updateOuterModelValue(v: V) {
    model.value = toOuterModel(v);
  }
  function updateInnerModelValue(v: T) {
    innerModel.value = toInnerModel(v);
  }
  watch(() => model.value, (v: T) => {
    updateInnerModelValue(v);
  }, { deep: true });
  watch(() => innerModel.value, (v: V) => {
    updateOuterModelValue(v);
  }, { deep: true });

  return innerModel;
}

export function isValidColumnId(id: unknown): id is PlAdvancedFilterColumnId {
  if (typeof id !== 'string') {
    return false;
  }
  try {
    const parsedId = parseJson<FilteredPColumnId | AnchoredPColumnId | AxisId>(id as CanonicalizedJson<FilteredPColumnId | AnchoredPColumnId | AxisId>);
    return isFilteredPColumn(parsedId) || isAnchoredPColumnId(parsedId) || isAxisId(parsedId);
  } catch {
    return false;
  }
}
