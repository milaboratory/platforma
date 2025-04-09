import { ConstantAxisFilter } from './common';
import { PObjectId, PTableRecordFilter } from '@milaboratories/pl-model-common';

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

export type JoinEntryV2 = 
  | ColumnJoinEntryV2
  | SlicedColumnJoinEntry
  | InnerJoinV2
  | FullJoinV2
  | OuterJoinV2;

export interface CreateTableRequestV2 {
  src: JoinEntryV2;
  filters: PTableRecordFilter[];
}
