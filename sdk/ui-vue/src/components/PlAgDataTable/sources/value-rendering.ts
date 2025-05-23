import { isPTableAbsent, PTableNA, type PTableColumnSpec, type PTableValue } from '@platforma-sdk/model';
import type { ValueFormatterFunc } from 'ag-grid-enterprise';
import type { PlAgDataTableRow } from '../types';
import type { PTableHidden } from './common';
import { isPTableHidden } from './common';
import * as d3 from 'd3-format';

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

export const FormatAnnotation = 'pl7.app/format';

export function getColumnRenderingSpec(spec: PTableColumnSpec): ColumnRenderingSpec {
  const valueType = spec.type === 'axis' ? spec.spec.type : spec.spec.valueType;
  switch (valueType) {
    case 'Int':
    case 'Long':
    case 'Float':
    case 'Double': {
      const format = spec.spec.annotations?.[FormatAnnotation];
      const formatFn = format ? d3.format(format) : undefined;
      return {
        valueFormatter: (params) => {
          const formatted = formatSpecialValues(params.value);
          if (formatted !== undefined) return formatted;
          return formatFn ? formatFn(Number(params.value)) : params.value!.toString();
        },
      };
    }
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
