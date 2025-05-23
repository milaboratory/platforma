import { type PTableColumnSpec, isLabelColumn as isLabelColumnSpec } from '@platforma-sdk/model';

export function isLabelColumn(column: PTableColumnSpec) {
  return column.type === 'column' && isLabelColumnSpec(column.spec);
}
