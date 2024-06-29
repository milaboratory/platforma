import { AxisQualification } from './common';
import { PColumnId, PTableRecordFilter } from '@milaboratory/sdk-model';

export interface ColumnJoinEntry {
  type: 'column';
  columnId: PColumnId;
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
