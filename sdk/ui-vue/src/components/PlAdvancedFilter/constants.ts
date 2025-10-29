import type { SUniversalPColumnId } from '@platforma-sdk/model';
import type { Filter, FilterType, SupportedFilterTypes } from './types';

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
  'equal',
  'notEqual',
  'patternFuzzyContainSubsequence',
  'patternMatchesRegularExpression',
  'inSet',
  'notInSet',
]);

export const DEFAULT_FILTER_TYPE: FilterType = 'isNA';

const emptyCommonPart = { column: '' as SUniversalPColumnId, fixedAxes: {} as Record<string, string> };
export const DEFAULT_FILTERS: Record<SupportedFilterTypes, Filter> = {
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
  equal: { type: 'equal', x: undefined, ...emptyCommonPart },
  notEqual: { type: 'notEqual', x: undefined, ...emptyCommonPart },
  inSet: { type: 'inSet', value: [], ...emptyCommonPart },
  notInSet: { type: 'notInSet', value: [], ...emptyCommonPart },
};
