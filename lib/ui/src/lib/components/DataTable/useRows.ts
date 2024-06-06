import type { Props, ColumnSettings, Data } from './types';
import { computed, unref, type ComputedRef } from 'vue';
import { compareRecords } from './domain';
import { DEFAULT_ROW_HEIGHT } from './constants';
import { tap, timer } from '@milaboratory/helpers/utils';

export function useRows(props: Props, data: Data, columnsRef: ComputedRef<ColumnSettings[]>) {
  return computed(() => {
    const columns = unref(columnsRef);

    const classes = unref(columnsRef).reduce(
      (r, col) => {
        r[col.name] = col.justify ? 'justify-' + col.justify : '';
        return r;
      },
      {} as Record<string, string>,
    );

    const rows = props.settings.rows.slice();

    const { bodyHeight, scrollTop } = data;

    if (props.settings.selfSort) {
      const sorts = columns.reduce(
        (acc, col) => {
          if (col.sort?.direction) {
            acc[col.name] = col.sort.direction;
          }
          return acc;
        },
        {} as Record<string, 'DESC' | 'ASC'>,
      );

      if (Object.keys(sorts).length) {
        rows.sort((a, b) => compareRecords(sorts, a, b));
      }
    }

    let offset = 0;

    const dt = timer();

    const height = tap(DEFAULT_ROW_HEIGHT, (n) => {
      return !Number.isFinite(n) || n < DEFAULT_ROW_HEIGHT ? DEFAULT_ROW_HEIGHT : n;
    });

    const vRows = [] as {
      index: number;
      row: Record<string, unknown>;
    }[];

    for (const [rowIndex, row] of Object.entries(rows)) {
      const visible = bodyHeight ? scrollTop < offset + height && offset < bodyHeight + scrollTop : false;
      offset += height + 1;
      if (visible) {
        vRows.push({
          index: Number(rowIndex),
          row,
        });
      }
    }

    const res = vRows.map(({ index, row }) => {
      const cells = columns.map((col) => {
        const colName = col.name;
        return {
          colName,
          rowIndex: index,
          value: row[colName],
          class: classes[colName] + (index === data.rowIndex ? ' hovered' : ''),
          slot: col.slot,
          editable: col.editable,
          width: col.width,
        };
      });

      return {
        visible: true,
        height,
        cells,
      };
    });

    console.log('dt', dt());

    return res;
  });
}
