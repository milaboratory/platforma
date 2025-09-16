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

const LOCAL_FILTER_TYPES: FilterType[] = ['InSet', 'NotInSet'];
export const ALL_FILTER_TYPES = new Set<FilterType>([...SUPPORTED_FILTER_TYPES, ...LOCAL_FILTER_TYPES]);

export const LOCAL_FILTERS_METADATA: Record<'InSet' | 'NotInSet', { label: string; supportedFor: (spec: NormalizedSpecData) => boolean }> = {
  InSet: {
    label: 'In set',
    supportedFor: (spec) => spec.valueType === 'String',
  },
  NotInSet: {
    label: 'Not in set',
    supportedFor: (spec) => spec.valueType === 'String',
  },
};

export const DEFAULT_FILTER_TYPE: FilterType = 'isNA';

export const DEFAULT_FILTERS: Record<FilterType, Filter> = {
  isNA: { type: 'isNA', sourceId: '' },
  isNotNA: { type: 'isNotNA', sourceId: '' },
  lessThan: { type: 'lessThan', sourceId: '', reference: undefined },
  lessThanOrEqual: { type: 'lessThanOrEqual', sourceId: '', reference: undefined },
  patternEquals: { type: 'patternEquals', sourceId: '', reference: undefined },
  patternNotEquals: { type: 'patternNotEquals', sourceId: '', reference: undefined },
  greaterThan: { type: 'greaterThan', sourceId: '', reference: undefined },
  greaterThanOrEqual: { type: 'greaterThanOrEqual', sourceId: '', reference: undefined },
  patternContainSubsequence: { type: 'patternContainSubsequence', sourceId: '', substring: '' },
  patternNotContainSubsequence: { type: 'patternNotContainSubsequence', sourceId: '', substring: '' },
  patternFuzzyContainSubsequence: { type: 'patternFuzzyContainSubsequence', sourceId: '', maxEdits: 2, substitutionsOnly: false, wildcard: undefined, reference: '' },
  patternMatchesRegularExpression: { type: 'patternMatchesRegularExpression', sourceId: '', reference: '' },
  numberEquals: { type: 'numberEquals', sourceId: '', reference: undefined },
  numberNotEquals: { type: 'numberNotEquals', sourceId: '', reference: undefined },
  InSet: { type: 'InSet', sourceId: '', reference: [] },
  NotInSet: { type: 'InSet', sourceId: '', reference: [] },
};
