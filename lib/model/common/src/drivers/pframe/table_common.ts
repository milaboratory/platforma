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

/** Unified PTable column identifier */
export type PTableColumnId = {
  type: 'axis';
  id: AxisId;
} | {
  type: 'column';
  id: PColumnId;
}
