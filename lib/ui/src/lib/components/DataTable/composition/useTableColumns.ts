import type { ColumnSettings, TableSettings, TableColumn, TableData } from '../types';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import { sliceBy } from '@milaboratory/helpers/collections';
import { asConst } from '../domain';
import { uniqueId } from '@milaboratory/helpers/strings';
import { GAP } from '../constants';

export function useTableColumns(state: { data: TableData; settings: ComputedRef<TableSettings> }) {
  return computed<TableColumn[]>(() => {
    const { data, settings } = state;

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
      offset += col.width + GAP;
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
