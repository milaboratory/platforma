import { AxisQualification } from './common';
import { PTableRecordFilter, SingleColumnSelector } from '@milaboratory/sdk-model';

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

export interface CreateTableRequest {
  src: JoinEntry;
  filters: PTableRecordFilter[];
}
