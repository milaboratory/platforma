import type { FilterSpecType } from '@platforma-sdk/model';
import type { EditableFilter, PlAdvancedFilterColumnId, SupportedFilterTypes } from './types';

// List of ALL supported filter types in Advanced Filter component
export const SUPPORTED_FILTER_TYPES = [
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
  'topN',
  'bottomN',
] satisfies FilterSpecType[];

export const DEFAULT_FILTER_TYPE: SupportedFilterTypes = 'isNA';

const emptyCommonPart = { column: '' as PlAdvancedFilterColumnId };
export const DEFAULT_FILTERS: Record<SupportedFilterTypes, EditableFilter> = {
  isNA: { type: 'isNA', ...emptyCommonPart },
  isNotNA: { type: 'isNotNA', ...emptyCommonPart },
  lessThan: { type: 'lessThan', x: 0, ...emptyCommonPart },
  lessThanOrEqual: { type: 'lessThanOrEqual', x: 0, ...emptyCommonPart },
  patternEquals: { type: 'patternEquals', value: undefined, ...emptyCommonPart },
  patternNotEquals: { type: 'patternNotEquals', value: undefined, ...emptyCommonPart },
  greaterThan: { type: 'greaterThan', x: 0, ...emptyCommonPart },
  greaterThanOrEqual: { type: 'greaterThanOrEqual', x: 0, ...emptyCommonPart },
  patternContainSubsequence: { type: 'patternContainSubsequence', value: '', ...emptyCommonPart },
  patternNotContainSubsequence: { type: 'patternNotContainSubsequence', value: '', ...emptyCommonPart },
  patternFuzzyContainSubsequence: { type: 'patternFuzzyContainSubsequence', maxEdits: 2, substitutionsOnly: false, wildcard: undefined, value: '', ...emptyCommonPart },
  patternMatchesRegularExpression: { type: 'patternMatchesRegularExpression', value: '', ...emptyCommonPart },
  equal: { type: 'equal', x: 0, ...emptyCommonPart },
  notEqual: { type: 'notEqual', x: 0, ...emptyCommonPart },
  inSet: { type: 'inSet', value: [], ...emptyCommonPart },
  notInSet: { type: 'notInSet', value: [], ...emptyCommonPart },
  topN: { type: 'topN', n: 10, ...emptyCommonPart },
  bottomN: { type: 'bottomN', n: 10, ...emptyCommonPart },
};
