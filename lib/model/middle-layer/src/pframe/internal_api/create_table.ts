import { AxisQualification } from './common';
import { SingleAxisSelector, SingleColumnSelector } from '@milaboratory/sdk-model';

export interface ColumnJoinEntry {
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
  | ColumnJoinEntry
  | InnerJoin
  | FullJoin
  | OuterJoin;

export type FilterPredicateType = 'Equal';

export interface FilterPredicate {
  type: FilterPredicateType;
  value: string | number;
}

export interface CreateTableColumnFilter {
  type: 'byColumnValue';
  columnMatcher: SingleColumnSelector;
  predicate: FilterPredicate;
}

export interface CreateTableAxisFilter {
  type: 'byAxisValue';
  axisMatcher: SingleAxisSelector;
  predicate: FilterPredicate;
}

export type CreateTableFilter = CreateTableAxisFilter | CreateTableColumnFilter;

export interface CreateTableRequest {
  src: JoinEntry;
  filters: CreateTableFilter[];
}
