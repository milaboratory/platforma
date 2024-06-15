import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import type { CellProps, TableColumn, TableData, TableRow, TableSettings } from '../types';

export function useTableRows(data: TableData, settings: ComputedRef<TableSettings>, tableColumns: ComputedRef<TableColumn[]>) {
  return computed<TableRow[]>(() => {
    return data.rows.map<TableRow>(({ index, offset, dataRow, height }) => {
      const primaryKey = settings.value.getPrimaryKey(dataRow, index);

      const classes = tableColumns.value.reduce(
        (r, col) => {
          r[col.id] = col.justify ? 'justify-' + col.justify : '';
          return r;
        },
        {} as Record<string | symbol, string>,
      );

      const cells = tableColumns.value.map<CellProps>((column) => {
        return {
          column: column,
          dataRow,
          primaryKey,
          rowIndex: index,
          value: dataRow[column.id],
          class: classes[column.id],
          slot: column.slot,
          editable: column.editable,
          width: column.width,
          style: column.style,
          control: column.control,
        };
      });

      return {
        style: {
          top: `${offset - data.scrollTop}px`,
        },
        primaryKey,
        offset,
        height,
        cells,
        selected: data.selectedRows.has(primaryKey),
      };
    });
  });
}
