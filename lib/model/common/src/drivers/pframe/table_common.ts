import { AxisId, AxisSpec, PColumnId, PColumnSpec } from './spec';

/** Unified spec object for axes and columns */
export type PTableColumnSpec = {
  type: 'axis';
  id: AxisId;
  spec: AxisSpec;
} | {
  type: 'column';
  id: PColumnId;
  spec: PColumnSpec;
}

export type PTableColumnIdAxis = {
  type: 'axis';
  id: AxisId;
}
export type PTableColumnIdColumn = {
  type: 'column';
  id: PColumnId;
}
/** Unified PTable column identifier */
export type PTableColumnId = PTableColumnIdAxis | PTableColumnIdColumn;
