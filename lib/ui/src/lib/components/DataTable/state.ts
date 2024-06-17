import { computed, provide, reactive, watch } from 'vue';
import type { TableProps, TableData, TableSettings } from './types';
import { deepClone } from '@milaboratory/helpers/objects';
import { stateKey } from './keys';
import { clamp, timer } from '@milaboratory/helpers/utils';
import { useTableColumns } from './composition/useTableColumns';
import { useTableRows } from './composition/useTableRows';
import { GAP, WINDOW_DELTA } from './constants';

type DataWindow = {
  bodyHeight: number;
  scrollTop: number;
  settings: TableSettings;
};

const loadRows = async (dataWindow: DataWindow) => {
  const { bodyHeight, scrollTop, settings } = dataWindow;

  const rows = await settings.dataSource.getRows(scrollTop, bodyHeight);

  const height = await settings.dataSource.getHeight();

  return { rows, height };
};

export function createState(props: TableProps) {
  const data = reactive<TableData>({
    rowIndex: -1,
    columns: [],
    loading: false,
    rows: [],
    resize: false,
    resizeTh: undefined,
    dataHeight: 0,
    bodyHeight: 600, // @TODO
    bodyWidth: 0,
    scrollTop: 0,
    scrollLeft: 0,
    selectedRows: new Set<string>(),
    selectedColumns: new Set<string>(),
  });

  watch(
    () => props.settings.columns,
    () => {
      data.columns = deepClone(props.settings.columns);
    },
    { immediate: true },
  );

  const settings = computed(() => {
    return props.settings;
  });

  const columnsWidth = computed(() => {
    return data.columns.reduce((acc, col) => acc + col.width + GAP, 0);
  });

  const maxScrollTop = computed(() => state.data.dataHeight - state.data.bodyHeight);
  const maxScrollLeft = computed(() => (columnsWidth.value > state.data.bodyWidth ? columnsWidth.value - state.data.bodyWidth : 0));

  const dataWindow = computed<DataWindow>(() => {
    return {
      bodyHeight: data.bodyHeight,
      scrollTop: data.scrollTop,
      selectedRows: data.selectedRows,
      settings: settings.value,
      columns: tableColumns.value,
    };
  });

  const tableColumns = useTableColumns({
    data,
    settings,
  });

  const tableRows = useTableRows(data, settings, tableColumns);

  const adjustWidth = () => {
    const newWidth = data.columns.reduce((acc, col) => acc + col.width + GAP, 0);

    const rightOffset = data.bodyWidth + data.scrollLeft;

    if (newWidth < rightOffset) {
      const last = data.columns[data.columns.length - 1];
      last.width = last.width + (rightOffset - newWidth);
    }
  };

  const minOffset = computed(() => data.rows.reduce((off, it) => Math.min(off, it.offset), Number.POSITIVE_INFINITY));
  const maxOffset = computed(() => data.rows.reduce((off, it) => Math.max(off, it.offset), 0));

  const state = {
    data,
    settings,
    tableColumns,
    tableRows,
    adjustWidth,
    updateOffsets(ev: { deltaY: number; deltaX: number }) {
      data.scrollTop = clamp(data.scrollTop + ev.deltaY, 0, maxScrollTop.value);
      data.scrollLeft = clamp(data.scrollLeft + ev.deltaX, 0, maxScrollLeft.value);
    },
    selectRow(primaryId: string) {
      data.selectedRows.add(primaryId);
    },
    unselectRow(primaryId: string) {
      data.selectedRows.delete(primaryId);
    },
    selectColumn(columnId: string) {
      data.selectedColumns.add(columnId);
    },
    unselectColumn(columnId: string) {
      data.selectedColumns.delete(columnId);
    },
  };

  watch(
    dataWindow,
    (v) => {
      const t = minOffset.value - v.scrollTop;

      const b = WINDOW_DELTA + maxOffset.value - v.scrollTop - v.bodyHeight;

      const needToLoad = t > 0 || b < 0;

      if (needToLoad && !data.loading) {
        data.loading = true;
        const dt = timer();
        loadRows(v)
          .then(({ rows, height }) => {
            data.rows = rows;
            data.dataHeight = height;
            console.log('new rows');
          })
          .finally(() => {
            data.loading = false;
            console.log('dt', dt());
          });
      }
    },
    { deep: true, immediate: true },
  );

  provide(stateKey, state);

  return state;
}

export type State = ReturnType<typeof createState>;
