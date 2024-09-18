import { AxisQualificationWithAxisId } from './common';
import { PObjectId, PTableRecordFilter } from '@milaboratories/pl-model-common';

export interface ColumnJoinEntry {
  type: 'column';
  columnId: PObjectId;
  qualifications: AxisQualificationWithAxisId[];
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

export type JoinEntry = ColumnJoinEntry | InnerJoin | FullJoin | OuterJoin;

export interface CreateTableRequest {
  src: JoinEntry;
  filters: PTableRecordFilter[];
}
