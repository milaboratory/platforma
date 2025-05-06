import { ConstantAxisFilter } from './common';
import { JsonDataInfo, PColumnSpec, PObjectId, PTableRecordFilter } from '@milaboratories/pl-model-common';

export interface ColumnJoinEntry {
  type: 'column';
  columnId: PObjectId;
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

export interface InlineColumnJoinEntry {
  readonly type: 'inlineColumn';
  readonly newId: PObjectId;
  readonly spec: PColumnSpec;
  readonly dataInfo: JsonDataInfo;
}

export interface InnerJoinV3 {
  type: 'inner';
  entries: JoinEntryV3[];
}

export interface FullJoinV3 {
  type: 'full';
  entries: JoinEntryV3[];
}

export interface OuterJoinV3 {
  type: 'outer';
  primary: JoinEntryV3;
  secondary: JoinEntryV3[];
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

export type JoinEntryV3 = 
  | ColumnJoinEntry
  | SlicedColumnJoinEntry
  | InlineColumnJoinEntry
  | InnerJoinV3
  | FullJoinV3
  | OuterJoinV3;

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

export interface CreateTableRequestV3 {
  src: JoinEntryV3;
  filters: PTableRecordFilter[];
}
