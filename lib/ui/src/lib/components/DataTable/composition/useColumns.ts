import type { ColumnSettings, TableData, Settings, TableColumn } from '../types';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import { sliceBy } from '@milaboratory/helpers/collections';
import { asConst } from '../domain';
import { uniqueId } from '@milaboratory/helpers/strings';

export function useColumns(data: TableData, settings: ComputedRef<Settings>) {
  return computed(() => {
    const { bodyWidth, scrollLeft } = data;

    const columns = [...data.columns];

    const controlId = uniqueId();

    if (settings.value.controlColumn) {
      columns.unshift(
        asConst<ColumnSettings>({
          id: controlId,
          label: '#',
          width: 60,
          frozen: true,
        }),
      );
    }

    let offset = 0;

    const tableColumns = columns.map((col) => {
      const it = { ...col, offset };
      offset += col.width + 1; // @TODO gap
      return it;
    });

    const frozen = tableColumns.filter((col) => col.frozen);

    const visibleColumns = sliceBy(tableColumns, (col) => {
      if (col.frozen) {
        return false;
      }
      return scrollLeft < col.offset + col.width && col.offset < bodyWidth + scrollLeft;
    }).concat(frozen);

    return visibleColumns.map<TableColumn>((col) => ({
      ...col,
      style: {
        left: col.frozen ? `${col.offset}px` : `${col.offset - data.scrollLeft}px`,
        width: `${col.width}px`,
      },
      control: col.id === controlId,
    }));
  });
}
