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
  fontFamily?: string;
};

export function getColumnRenderingSpec(spec: PTableColumnSpec): ColumnRenderingSpec {
  const valueType = spec.type === 'axis' ? spec.spec.type : spec.spec.valueType;
  let renderSpec: ColumnRenderingSpec;
  switch (valueType) {
    case 'Int':
    case 'Long':
    case 'Float':
    case 'Double': {
      const format = spec.spec.annotations?.['pl7.app/format'];
      const formatFn = format ? d3.format(format) : undefined;
      renderSpec = {
        valueFormatter: (params) => {
          const formatted = formatSpecialValues(params.value);
          if (formatted !== undefined) return formatted;
          return formatFn ? formatFn(Number(params.value)) : params.value!.toString();
        },
      };
      break;
    }
    default:
      renderSpec = {
        valueFormatter: (params) => {
          const formatted = formatSpecialValues(params.value);
          if (formatted !== undefined) return formatted;
          return params.value!.toString();
        },
      };
      break;
  }
  const fontFamily = spec.spec.annotations?.['pl7.app/table/fontFamily'];
  if (fontFamily) renderSpec.fontFamily = fontFamily;
  return renderSpec;
}
