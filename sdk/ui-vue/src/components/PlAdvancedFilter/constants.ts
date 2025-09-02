import type { Filter, FilterType } from './types';

export const FILTER_TYPE_OPTIONS: {
  value: FilterType;
  label: string;
  valueType: 'string' | 'number' | 'any';
}[] = [
  { value: 'IsNA', label: 'Is NA', valueType: 'any' },
  { value: 'IsNotNA', label: 'Is not NA', valueType: 'any' },
  { value: 'Less', label: 'Less than', valueType: 'number' },
  { value: 'LessOrEqual', label: 'Less or equal', valueType: 'number' },
  { value: 'Equal', label: 'Equal', valueType: 'any' },
  { value: 'NotEqual', label: 'Not equal', valueType: 'any' },
  { value: 'InSet', label: 'In set', valueType: 'string' },
  { value: 'NotInSet', label: 'Not in set', valueType: 'string' },
  { value: 'Greater', label: 'Greater than', valueType: 'number' },
  { value: 'GreaterOrEqual', label: 'Greater or equal', valueType: 'number' },
  { value: 'StringContains', label: 'Contains', valueType: 'string' },
  { value: 'StringNotContains', label: 'Not contains', valueType: 'string' },
  { value: 'StringContainsFuzzy', label: 'Fuzzy contains', valueType: 'string' },
  { value: 'StringMatches', label: 'Matches', valueType: 'string' },
];

export const DEFAULT_FILTER_TYPE: FilterType = 'IsNA';

export const DEFAULT_FILTERS: Record<FilterType, Filter> = {
  IsNA: { type: 'IsNA', sourceId: '' },
  IsNotNA: { type: 'IsNotNA', sourceId: '' },
  Less: { type: 'Less', sourceId: '', reference: undefined },
  LessOrEqual: { type: 'LessOrEqual', sourceId: '', reference: undefined },
  Equal: { type: 'Equal', sourceId: '', reference: undefined },
  NotEqual: { type: 'NotEqual', sourceId: '', reference: undefined },
  InSet: { type: 'InSet', sourceId: '', reference: [] },
  NotInSet: { type: 'InSet', sourceId: '', reference: [] },
  Greater: { type: 'Greater', sourceId: '', reference: undefined },
  GreaterOrEqual: { type: 'GreaterOrEqual', sourceId: '', reference: undefined },
  StringContains: { type: 'StringContains', sourceId: '', substring: '' },
  StringNotContains: { type: 'StringNotContains', sourceId: '', substring: '' },
  StringContainsFuzzy: { type: 'StringContainsFuzzy', sourceId: '', maxEdits: 2, substitutionsOnly: false, wildcard: undefined, reference: '' },
  StringMatches: { type: 'StringMatches', sourceId: '', reference: '' },
};
