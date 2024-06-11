import type { Data, TableColumn } from '../types';
import { computed } from 'vue';
import { sliceBy } from '@milaboratory/helpers/collections';

export function useColumns(data: Data) {
  return computed(() => {
    const { bodyWidth, scrollLeft } = data;

    let offset = 0;

    const columns = data.columns.map((col) => {
      const it = { ...col, offset };
      offset += col.width + 1; // @TODO gap
      return it;
    });

    const visibleColumns = sliceBy(columns, (col) => {
      return scrollLeft < col.offset + col.width && col.offset < bodyWidth + scrollLeft;
    });

    return visibleColumns.map<TableColumn>((col) => ({
      ...col,
      style: {
        left: `${col.offset - data.scrollLeft}px`,
        width: `${col.width}px`,
      },
    }));
  });
}
