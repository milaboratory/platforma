import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import type { TableCell, TableColumn, TableData, TableRow } from '../types';
import { identity } from '@milaboratory/helpers';

export function useTableRows(data: TableData, tableColumns: ComputedRef<TableColumn[]>) {
  const classesRef = computed(() =>
    tableColumns.value.reduce(
      (r, col) => {
        r[col.id] = col.justify ? 'justify-' + col.justify : '';
        return r;
      },
      {} as Record<string | symbol, string>,
    ),
  );

  return computed<TableRow[]>(() => {
    return data.rows.map<TableRow>((row) => {
      const classes = classesRef.value;

      const { primaryKey, offset, dataRow, height } = row;

      const cells = tableColumns.value.map<TableCell>((column) => {
        return {
          column,
          row,
          value: dataRow[column.id],
          class: classes[column.id],
          editable: column.editable,
          width: column.width,
          style: column.style,
          control: column.control,
        };
      });

      return identity<TableRow>({
        style: {
          top: `${offset - data.scrollTop}px`,
          height: `${row.height}px`,
        },
        primaryKey,
        offset,
        height,
        cells,
        selected: data.selectedRows.has(primaryKey),
      });
    });
  });
}
