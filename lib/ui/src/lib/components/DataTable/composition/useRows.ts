import type { Data, CellProps, TableRow, TableColumn, RowSettings } from '../types';
import { ComputedRef, computed, unref } from 'vue';
import { identity } from '../domain';
import { sliceBy } from '@milaboratory/helpers/collections';
import { performanceTimer } from '@milaboratory/helpers/utils';

// function sortRows(columns: ColumnSettings[], rows: Record<string, unknown>[]) {
//   const sorts = columns.reduce(
//     (acc, col) => {
//       if (col.sort?.direction) {
//         acc[col.name] = col.sort.direction;
//       }
//       return acc;
//     },
//     {} as Record<string, 'DESC' | 'ASC'>,
//   );

//   if (Object.keys(sorts).length) {
//     rows.sort((a, b) => compareRecords(sorts, a, b));
//   }
// }

export function useRows(data: Data, columnsRef: ComputedRef<TableColumn[]>, datum: ComputedRef<RowSettings[]>) {
  return computed(() => {
    const { bodyHeight, scrollTop } = data;

    const columns = unref(columnsRef);

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
