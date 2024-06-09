import type { Data, CellProps, TableRow } from '../types';
import { computed } from 'vue';
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

export function useRows(data: Data) {
  return computed(() => {
    const { bodyHeight, scrollTop, columns } = data;

    const classes = columns.reduce(
      (r, col) => {
        r[col.name] = col.justify ? 'justify-' + col.justify : '';
        return r;
      },
      {} as Record<string, string>,
    );

    const pt = performanceTimer();

    const visibleRows = sliceBy(data.rows, (it) => {
      return scrollTop < it.offset + it.height && it.offset < bodyHeight + scrollTop;
    });

    // console.log('pt1', pt(), visibleRows.length);

    const r = visibleRows.map<TableRow>(({ index, offset, values, height }) => {
      const cells = columns.map((col) => {
        return identity<CellProps>({
          colName: col.name,
          rowIndex: index,
          value: values[col.name],
          class: classes[col.name] + (index === data.rowIndex ? ' hovered' : ''),
          slot: col.slot,
          editable: col.editable,
          width: col.width,
        });
      });

      const offX = -Math.round(data.scrollLeft);

      return {
        style: {
          top: `${offset - data.scrollTop}px`,
          left: `${offX}px`,
        },
        offset,
        height,
        cells,
      };
    });
    console.log('pt2', pt());
    return r;
  });
}
