import type { PObjectId } from '../../pool';
import type { AxisId, AxisSpec, PColumnSpec } from './spec/spec';

/** Unified spec object for axes and columns */
export type PTableColumnSpec =
  | {
    type: 'axis';
    id: AxisId;
    spec: AxisSpec;
  }
  | {
    type: 'column';
    id: PObjectId;
    spec: PColumnSpec;
  };

export type PTableColumnIdAxis = {
  type: 'axis';
  id: AxisId;
};

export type PTableColumnIdColumn = {
  type: 'column';
  id: PObjectId;
};

/** Unified PTable column identifier */
export type PTableColumnId = PTableColumnIdAxis | PTableColumnIdColumn;
