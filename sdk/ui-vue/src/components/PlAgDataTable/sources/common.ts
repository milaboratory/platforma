import type {
  ColDef,
  ICellRendererParams,
  ValueFormatterParams,
} from 'ag-grid-enterprise';
import type {
  AxisId,
  PTableColumnSpec,
  PTableValue,
  PTableRowKey,
} from '@platforma-sdk/model';
import {
  isPTableAbsent,
  PTableNA,
  stringifyPTableColumnSpec,
  isColumnOptional,
  isLabelColumn as isLabelColumnSpec,
  canonicalizeJson,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import type {
  PlAgHeaderComponentParams,
  PlAgHeaderComponentType,
} from '../../PlAgColumnHeader';
import {
  PlAgColumnHeader,
} from '../../PlAgColumnHeader';
import PlAgTextAndButtonCell from '../../PlAgTextAndButtonCell/PlAgTextAndButtonCell.vue';
import type {
  PlAgDataTableRow,
  PTableRowKeyJson,
} from '../types';
import {
  defaultMainMenuItems,
} from './menu-items';

export type PlAgCellButtonAxisParams = {
  showCellButtonForAxisId?: AxisId;
  cellButtonInvokeRowsOnDoubleClick?: boolean;
  trigger: (key?: PTableRowKey) => void;
};

export const PTableHidden = { type: 'hidden' };
export type PTableHidden = typeof PTableHidden;

export function isPTableHidden(value: PTableValue): value is PTableHidden {
  return typeof value === 'object' && value !== null && value.type === 'hidden';
}

export const defaultValueFormatter = (value: ValueFormatterParams<PlAgDataTableRow, PTableValue>) => {
  if (value.value === undefined) {
    return 'undefined';
  } else if (isPTableHidden(value.value)) {
    return 'loading...';
  } else if (isPTableAbsent(value.value) || value.value === PTableNA) {
    return '';
  } else {
    return value.value.toString();
  }
};

/**
 * Calculates column definition for a given p-table column
 */
export function makeColDef(
  iCol: number,
  spec: PTableColumnSpec,
  hiddenColIds?: string[],
  cellButtonAxisParams?: PlAgCellButtonAxisParams,
): ColDef {
  const colId = stringifyPTableColumnSpec(spec);
  const valueType = spec.type === 'axis' ? spec.spec.type : spec.spec.valueType;
  return {
    colId,
    mainMenuItems: defaultMainMenuItems,
    context: spec,
    field: iCol.toString(),
    headerName: spec.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + spec.type + ' ' + iCol.toString(),
    lockPosition: spec.type === 'axis',
    hide: hiddenColIds?.includes(colId) ?? isColumnOptional(spec.spec),
    valueFormatter: defaultValueFormatter,
    headerComponent: PlAgColumnHeader,
    cellRendererSelector: cellButtonAxisParams?.showCellButtonForAxisId
      ? (params: ICellRendererParams) => {
          if (spec.type !== 'axis') return;

          const axisId = (params.colDef?.context as PTableColumnSpec)?.id as AxisId;
          if (lodash.isEqual(axisId, cellButtonAxisParams.showCellButtonForAxisId)) {
            return {
              component: PlAgTextAndButtonCell,
              params: {
                invokeRowsOnDoubleClick: cellButtonAxisParams.cellButtonInvokeRowsOnDoubleClick,
                onClick: (prms: ICellRendererParams<PlAgDataTableRow>) => {
                  cellButtonAxisParams.trigger(prms.data?.key);
                },
              },
            };
          }
        }
      : undefined,
    headerComponentParams: {
      type: ((): PlAgHeaderComponentType => {
        switch (valueType) {
          case 'Int':
          case 'Long':
          case 'Float':
          case 'Double':
            return 'Number';
          case 'String':
          case 'Bytes':
            return 'Text';
          default:
            throw Error(`unsupported data type: ${valueType}`);
        }
      })(),
    } satisfies PlAgHeaderComponentParams,
    cellDataType: (() => {
      switch (valueType) {
        case 'Int':
        case 'Long':
        case 'Float':
        case 'Double':
          return 'number';
        case 'String':
        case 'Bytes':
          return 'text';
        default:
          throw Error(`unsupported data type: ${valueType}`);
      }
    })(),
  };
}

export function makeRowId(rowKey: PTableValue[]): PTableRowKeyJson {
  return canonicalizeJson(rowKey);
}

export function isLabelColumn(column: PTableColumnSpec) {
  return column.type === 'column' && isLabelColumnSpec(column.spec);
}
