import type { TableData, CellProps, TableRow, TableColumn, RowSettings, Settings } from '../types';
import type { ComputedRef } from 'vue';
import { computed, unref } from 'vue';
import { identity } from '../domain';
import { sliceBy } from '@milaboratory/helpers/collections';

export function useRows(
  data: TableData,
  ctx: {
    columns: ComputedRef<TableColumn[]>;
    datum: ComputedRef<RowSettings[]>;
    settings: ComputedRef<Settings>;
  },
) {
  return computed(() => {
    const { bodyHeight, scrollTop } = data;

    const columns = unref(ctx.columns);

    const classes = columns.reduce(
      (r, col) => {
        r[col.id] = col.justify ? 'justify-' + col.justify : '';
        return r;
      },
      {} as Record<string | symbol, string>,
    );

    const visibleRows = sliceBy(ctx.datum.value, (it) => {
      return scrollTop < it.offset + it.height && it.offset < bodyHeight + scrollTop;
    });

    return visibleRows.map<TableRow>(({ index, offset, dataRow, height }) => {
      const primaryKey = ctx.settings.value.getPrimaryKey(dataRow, index);

      const cells = columns.map((column) => {
        return identity<CellProps>({
          column: column,
          dataRow,
          primaryKey,
          rowIndex: index,
          value: dataRow[column.id],
          class: classes[column.id] + (index === data.rowIndex ? ' hovered' : ''),
          slot: column.slot,
          editable: column.editable,
          width: column.width,
          style: column.style,
          control: column.control,
        });
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
