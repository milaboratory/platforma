import type { SUniversalPColumnId } from '@platforma-sdk/model';
import type { Filter, FilterType, SupportedFilterTypes } from './types';
import type { NormalizedSpecData } from './utils';

export const SUPPORTED_FILTER_TYPES = new Set<SupportedFilterTypes>([
  'isNA',
  'isNotNA',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'patternEquals',
  'patternNotEquals',
  'patternContainSubsequence',
  'patternNotContainSubsequence',
  'numberEquals',
  'numberNotEquals',
  'patternFuzzyContainSubsequence',
  'patternMatchesRegularExpression',
]);

const LOCAL_FILTER_TYPES: FilterType[] = ['inSet', 'notInSet'];
export const ALL_FILTER_TYPES = new Set<FilterType>([...SUPPORTED_FILTER_TYPES, ...LOCAL_FILTER_TYPES]);

export const LOCAL_FILTERS_METADATA: Record<'inSet' | 'notInSet', { label: string; supportedFor: (spec: NormalizedSpecData) => boolean }> = {
  inSet: {
    label: 'In set',
    supportedFor: (spec) => spec.valueType === 'String',
  },
  notInSet: {
    label: 'Not in set',
    supportedFor: (spec) => spec.valueType === 'String',
  },
};

export const DEFAULT_FILTER_TYPE: FilterType = 'isNA';

const emptyColumnId = '' as SUniversalPColumnId;
export const DEFAULT_FILTERS: Record<FilterType, Filter> = {
  isNA: { type: 'isNA', column: emptyColumnId },
  isNotNA: { type: 'isNotNA', column: emptyColumnId },
  lessThan: { type: 'lessThan', column: emptyColumnId, x: undefined },
  lessThanOrEqual: { type: 'lessThanOrEqual', column: emptyColumnId, x: undefined },
  patternEquals: { type: 'patternEquals', column: emptyColumnId, value: '' },
  patternNotEquals: { type: 'patternNotEquals', column: emptyColumnId, value: '' },
  greaterThan: { type: 'greaterThan', column: emptyColumnId, x: undefined },
  greaterThanOrEqual: { type: 'greaterThanOrEqual', column: emptyColumnId, x: undefined },
  patternContainSubsequence: { type: 'patternContainSubsequence', column: emptyColumnId, value: '' },
  patternNotContainSubsequence: { type: 'patternNotContainSubsequence', column: emptyColumnId, value: '' },
  patternFuzzyContainSubsequence: { type: 'patternFuzzyContainSubsequence', column: emptyColumnId, maxEdits: 2, substitutionsOnly: false, wildcard: undefined, value: '' },
  patternMatchesRegularExpression: { type: 'patternMatchesRegularExpression', column: emptyColumnId, value: '' },
  numberEquals: { type: 'numberEquals', column: emptyColumnId, x: undefined },
  numberNotEquals: { type: 'numberNotEquals', column: emptyColumnId, x: undefined },
  inSet: { type: 'inSet', column: emptyColumnId, value: [] },
  notInSet: { type: 'notInSet', column: emptyColumnId, value: [] },
};
