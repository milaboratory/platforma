import type { PObjectId } from '../../pool';
import type { AxisId, AxisSpec, PColumnSpec } from './spec/spec';

export type PTableColumnSpecAxis = {
  type: 'axis';
  id: AxisId;
  spec: AxisSpec;
};

export type PTableColumnSpecColumn = {
  type: 'column';
  id: PObjectId;
  spec: PColumnSpec;
};

/** Unified spec object for axes and columns */
export type PTableColumnSpec = PTableColumnSpecAxis | PTableColumnSpecColumn;

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

export function getPTableColumnId(spec: PTableColumnSpec): PTableColumnId {
  switch (spec.type) {
    case 'axis':
      return {
        type: 'axis',
        id: spec.id,
      };
    case 'column':
      return {
        type: 'column',
        id: spec.id,
      };
  }
}
