import { AxisSpec, PColumnId, PColumnSpec } from './spec';
import { PTableVector } from './data';
import { SingleAxisSelector, SingleColumnSelector } from './selectors';

/** Unified spec object for axes and columns */
export type PTableColumnSpec = {
  type: 'axis';
  spec: AxisSpec;
} | {
  type: 'column';
  id: PColumnId;
  spec: PColumnSpec;
}

export interface FullPTableColumnData {
  /** Unified spec */
  readonly spec: PTableColumnSpec;

  /** Data */
  readonly data: PTableVector;
}

/** Response for */
export type GetTableDataResponse = FullPTableColumnData[];

export interface ColumnJoinEntry {
  type: 'column';
  columnId: PColumnId;
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

export interface GetTableDataColumnFilter {
  type: 'byColumnValue';
  columnId: PColumnId;
  predicate: FilterPredicate;
}

export interface GetTableDataAxisFilter {
  type: 'byAxisValue';
  axis: SingleAxisSelector;
  predicate: FilterPredicate;
}

export type GetTableDataFilter = GetTableDataAxisFilter | GetTableDataColumnFilter;

export interface GetTableDataRequest {
  src: JoinEntry;
  filters: GetTableDataFilter[];
}
