import { ConstantAxisFilter } from './common';
import { JsonDataInfo, PColumnSpec, PObjectId, PTableRecordFilter } from '@milaboratories/pl-model-common';

export interface ColumnJoinEntry {
  type: 'column';
  columnId: PObjectId;
}

export interface SlicedColumnJoinEntry {
  readonly type: 'slicedColumn';
  readonly columnId: PObjectId;
  readonly newId: PObjectId;
  readonly axisFilters: ConstantAxisFilter[];
}

export interface ArtificialColumnJoinEntry {
  readonly type: 'artificialColumn';
  readonly columnId: PObjectId;
  readonly newId: PObjectId;
  readonly axesIndices: number[];
}

export interface InlineColumnJoinEntry {
  readonly type: 'inlineColumn';
  readonly newId: PObjectId;
  readonly spec: PColumnSpec;
  readonly dataInfo: JsonDataInfo;
}

export interface InnerJoinV4 {
  type: 'inner';
  entries: JoinEntryV4[];
}

export interface FullJoinV4 {
  type: 'full';
  entries: JoinEntryV4[];
}

export interface OuterJoinV4 {
  type: 'outer';
  primary: JoinEntryV4;
  secondary: JoinEntryV4[];
}

export type JoinEntryV4 = 
  | ColumnJoinEntry
  | SlicedColumnJoinEntry
  | ArtificialColumnJoinEntry
  | InlineColumnJoinEntry
  | InnerJoinV4
  | FullJoinV4
  | OuterJoinV4;

export interface CreateTableRequestV4 {
  src: JoinEntryV4;
  filters: PTableRecordFilter[];
}
