import { isPTableAbsent, PTableNA, type PTableColumnSpec, type PTableValue } from '@platforma-sdk/model';
import type { ValueFormatterFunc } from 'ag-grid-enterprise';
import type { PlAgDataTableRow } from '../types';

export const PTableHidden = { type: 'hidden' } as const;
export type PTableHidden = typeof PTableHidden;

export function isPTableHidden(value: PTableValue | PTableHidden): value is PTableHidden {
  return typeof value === 'object' && value !== null && value.type === 'hidden';
}

export function formatSpecialValues(value: PTableValue | PTableHidden | undefined): string | undefined {
  if (value === undefined) {
    return 'undefined';
  } else if (isPTableHidden(value)) {
    return 'loading...';
  } else if (isPTableAbsent(value) || value === PTableNA) {
    return '';
  } else {
    return undefined;
  }
};

export type ColumnRenderingSpec = {
  valueFormatter: ValueFormatterFunc<PlAgDataTableRow, PTableValue | PTableHidden>;
};

function formatNumber(value: number | string | null | undefined): string {
  if (typeof value !== 'number' || isNaN(value)) return value?.toString() ?? '';

  if (value === 0) {
    return '0';
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e5) {
    const sn = absValue.toExponential(3);
    return sign + sn.toUpperCase();
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  if (absValue > 0 && absValue < 1e-4) {
    const sn = absValue.toExponential(3);
    return sign + sn.toUpperCase();
  }

  let numStr = absValue.toPrecision(5);

  if (numStr.includes('e')) {
    const parts = numStr.split('e');
    let mantissa = parts[0];
    const exponent = parts[1];
    if (mantissa.includes('.')) {
      mantissa = mantissa.replace(/0+$/, '');
      if (mantissa.endsWith('.')) {
        mantissa = mantissa.slice(0, -1);
      }
    }
    return sign + mantissa + 'E' + exponent;
  }

  // If not scientific, it's a standard decimal string from toPrecision
  if (numStr.includes('.')) {
    numStr = numStr.replace(/0+$/, '');
    if (numStr.endsWith('.')) {
      numStr = numStr.slice(0, -1);
    }
  }
  return sign + numStr;
}

export function getColumnRenderingSpec(spec: PTableColumnSpec): ColumnRenderingSpec {
  const valueType = spec.type === 'axis' ? spec.spec.type : spec.spec.valueType;
  switch (valueType) {
    case 'Int':
    case 'Long':
    case 'Float':
    case 'Double':
      return {
        valueFormatter: (params) => {
          const formatted = formatSpecialValues(params.value);
          if (formatted !== undefined) return formatted;
          return formatNumber(Number(params.value));
        },
      };
    default:
      return {
        valueFormatter: (params) => {
          const formatted = formatSpecialValues(params.value);
          if (formatted !== undefined) return formatted;
          return params.value!.toString();
        },
      };
  }
}
