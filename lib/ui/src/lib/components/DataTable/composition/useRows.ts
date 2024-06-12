import type { Data, CellProps, TableRow, TableColumn, RowSettings } from '../types';
import type { ComputedRef } from 'vue';
import { computed, unref } from 'vue';
import { identity } from '../domain';
import { sliceBy } from '@milaboratory/helpers/collections';

export function useRows(data: Data, columnsRef: ComputedRef<TableColumn[]>, datum: ComputedRef<RowSettings[]>) {
  return computed(() => {
    const { bodyHeight, scrollTop } = data;

    const columns = unref(columnsRef);

    console.log('columns.length', columns.length);

    const classes = columns.reduce(
      (r, col) => {
        r[col.id] = col.justify ? 'justify-' + col.justify : '';
        return r;
      },
      {} as Record<string, string>,
    );

    const visibleRows = sliceBy(datum.value, (it) => {
      return scrollTop < it.offset + it.height && it.offset < bodyHeight + scrollTop;
    });

    return visibleRows.map<TableRow>(({ index, offset, values, height }) => {
      const cells = columns.map((column) => {
        return identity<CellProps>({
          column: column,
          rowIndex: index,
          value: values[column.id],
          class: classes[column.id] + (index === data.rowIndex ? ' hovered' : ''),
          slot: column.slot,
          editable: column.editable,
          width: column.width,
          style: column.style,
        });
      });

      return {
        style: {
          top: `${offset - data.scrollTop}px`,
        },
        offset,
        height,
        cells,
      };
    });
  });
}
