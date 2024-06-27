import { SingleAxisSelector, SingleColumnSelector } from './selectors';
import { AxisQualification } from './common';
import { AxisSpec, ColumnIdAndSpec } from '@milaboratory/sdk-model';

export interface ColumnWithQualifications {
  type: 'column';
  columnMatcher: SingleColumnSelector;
  qualifications: AxisQualification[];
}

export interface InnerJoin {
  type: 'inner';
  entries: JoinEntry[];
}

export interface FullJoin {
  type: 'full';
  entries: JoinEntry[];
}

export interface OuterJoin {
  type: 'outer';
  primary: JoinEntry;
  secondary: JoinEntry[];
}

export type JoinEntry =
  | ColumnWithQualifications
  | InnerJoin
  | FullJoin
  | OuterJoin;

export type FilterPredicateType = 'Equal';

export interface FilterPredicate {
  type: FilterPredicateType;
  value: string | number;
}

export interface GetTableColumnFilter {
  type: 'byColumnValue';
  columnMatcher: SingleColumnSelector;
  predicate: FilterPredicate;
}

export interface GetTableAxisFilter {
  type: 'byAxisValue';
  axisMatcher: SingleAxisSelector;
  predicate: FilterPredicate;
}

export type GetTableFilter = GetTableAxisFilter | GetTableColumnFilter;

export type GetTableOutputFormat = 'JS';

export interface GetTableRequest {
  type: 'getTable';
  src: JoinEntry;
  filters: GetTableFilter[];
  outputFormat: GetTableOutputFormat;
}

