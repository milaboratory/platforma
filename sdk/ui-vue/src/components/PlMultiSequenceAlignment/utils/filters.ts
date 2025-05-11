import type {
  AxisId,
} from '@platforma-sdk/model';
import type {
  PTableRecordSingleValueFilterV2,
  PTableColumnId,
} from '@platforma-sdk/model';

/**
 * Returns a pColumn threshold filter array if conditions are met, otherwise empty array
 */
export function GreaterOrEqualFilter(
  pColumnId: string | undefined,
  threshold: number | undefined,
): PTableRecordSingleValueFilterV2[] {
  if (!pColumnId || threshold === undefined || !threshold) {
    return [];
  }

  return [{
    type: 'bySingleColumnV2',
    column: { type: 'column', id: pColumnId } as PTableColumnId,
    predicate: {
      operator: 'GreaterOrEqual',
      reference: threshold,
    },
  }];
}

/**
 * Returns a filtered array without rows having NA in given Pcolumn
 */
export function isNotNaFilter(
  pColumnId: string | undefined,
): PTableRecordSingleValueFilterV2[] {
  if (!pColumnId) {
    return [];
  }

  return [{
    type: 'bySingleColumnV2',
    column: { type: 'column', id: pColumnId } as PTableColumnId,
    predicate: {
      operator: 'Not',
      operand: {
        operator: 'IsNA',
      },
    },
  }];
}

/**
 * Returns an array filtered by specif pColumn value or axis
 */
export function equalStringFilter(
  pColumnIdOrAxis: string | AxisId | undefined,
  colVals: string[] | undefined,
): PTableRecordSingleValueFilterV2[] {
  if (!pColumnIdOrAxis || colVals === undefined || colVals.length === 0) {
    return [];
  }

  // Determine if the filter is for an axis or a column. AxisId is an object
  let type: 'axis' | 'column' = 'axis';
  if (typeof pColumnIdOrAxis === 'string') {
    type = 'column';
  }

  type Operand = {
    operator: 'Equal';
    reference: string;
  };

  const operandList: Operand[] = [];
  for (const col of colVals) {
    operandList.push({
      operator: 'Equal',
      reference: col,
    });
  }
  return [{
    type: 'bySingleColumnV2',
    column: { type, id: pColumnIdOrAxis } as PTableColumnId,
    predicate: {
      operator: 'Or',
      operands: operandList },
  }];
}
