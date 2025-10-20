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

const emptyCommonPart = { column: '' as SUniversalPColumnId, fixedAxes: {} as Record<string, string> };
export const DEFAULT_FILTERS: Record<FilterType, Filter> = {
  isNA: { type: 'isNA', ...emptyCommonPart },
  isNotNA: { type: 'isNotNA', ...emptyCommonPart },
  lessThan: { type: 'lessThan', x: undefined, ...emptyCommonPart },
  lessThanOrEqual: { type: 'lessThanOrEqual', x: undefined, ...emptyCommonPart },
  patternEquals: { type: 'patternEquals', value: undefined, ...emptyCommonPart },
  patternNotEquals: { type: 'patternNotEquals', value: undefined, ...emptyCommonPart },
  greaterThan: { type: 'greaterThan', x: undefined, ...emptyCommonPart },
  greaterThanOrEqual: { type: 'greaterThanOrEqual', x: undefined, ...emptyCommonPart },
  patternContainSubsequence: { type: 'patternContainSubsequence', value: '', ...emptyCommonPart },
  patternNotContainSubsequence: { type: 'patternNotContainSubsequence', value: '', ...emptyCommonPart },
  patternFuzzyContainSubsequence: { type: 'patternFuzzyContainSubsequence', maxEdits: 2, substitutionsOnly: false, wildcard: undefined, value: '', ...emptyCommonPart },
  patternMatchesRegularExpression: { type: 'patternMatchesRegularExpression', value: '', ...emptyCommonPart },
  numberEquals: { type: 'numberEquals', x: undefined, ...emptyCommonPart },
  numberNotEquals: { type: 'numberNotEquals', x: undefined, ...emptyCommonPart },
  inSet: { type: 'inSet', value: [], ...emptyCommonPart },
  notInSet: { type: 'notInSet', value: [], ...emptyCommonPart },
};
