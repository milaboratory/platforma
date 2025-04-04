import { AxisQualificationWithAxisId, ConstantAxisFilter } from './common';
import { PObjectId, PTableRecordFilter } from '@milaboratories/pl-model-common';

export interface ColumnJoinEntry {
  type: 'column';
  columnId: PObjectId;
  qualifications: AxisQualificationWithAxisId[];
}

export interface ColumnJoinEntryV2 {
  type: 'column';
  columnId: PObjectId;
}

export interface SlicedColumnJoinEntry {
  readonly type: 'slicedColumn';
  readonly columnId: PObjectId;
  readonly newId: PObjectId;
  readonly axisFilters: ConstantAxisFilter[];
}

export interface InnerJoinV2 {
  type: 'inner';
  entries: JoinEntryV2[];
}

export interface FullJoinV2 {
  type: 'full';
  entries: JoinEntryV2[];
}

export interface OuterJoinV2 {
  type: 'outer';
  primary: JoinEntryV2;
  secondary: JoinEntryV2[];
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

export type JoinEntryV2 = 
  | ColumnJoinEntryV2
  | SlicedColumnJoinEntry
  | InnerJoinV2
  | FullJoinV2
  | OuterJoinV2;

export interface CreateTableRequest {
  src: JoinEntry;
  filters: PTableRecordFilter[];
}

export interface CreateTableRequestV2 {
  src: JoinEntryV2;
  filters: PTableRecordFilter[];
}
