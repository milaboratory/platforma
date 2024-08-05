import { computed, provide, reactive, watch } from 'vue';
import type { TableProps, TableData, DataWindow, PrimaryKey, Row, ColumnSpecSettings, DataSource } from './types';
import { deepClone, deepEqual } from '@milaboratory/helpers/objects';
import { stateKey } from './keys';
import { clamp, delay, resolveAwaited, tap } from '@milaboratory/helpers/utils';
import { useTableColumns } from './composition/useTableColumns';
import { useTableRows } from './composition/useTableRows';
import { GAP, WINDOW_DELTA } from './constants';

const loadRows = async (dataWindow: { scrollTop: number; bodyHeight: number }, dataSource: DataSource) => {
  const { scrollTop, bodyHeight } = dataWindow;

  await delay(0);

  return resolveAwaited({
    rows: dataSource.getRows(scrollTop, bodyHeight),
    height: dataSource.getHeight(),
    dataWindow,
  });
};

export function createState(props: TableProps) {
  const data = reactive<TableData>({
    rowIndex: -1,
    columns: [],
    pendingLoads: 0,
    currentWindow: undefined,
    rows: [],
    resize: false,
    resizeTh: undefined,
    dataHeight: 0,
    bodyHeight: props.settings.height,
    bodyWidth: 0,
    scrollTop: 0,
    scrollLeft: 0,
    selectedRows: new Set<PrimaryKey>(),
    selectedColumns: new Set<string>(),
  });

  watch(
    () => props.settings,
    () => {
      data.columns = deepClone(props.settings.columns);
      data.currentWindow = undefined;
    },
    { immediate: true },
  );

  const settings = computed(() => {
    return props.settings;
  });

  const columnsWidth = computed(() => {
    return data.columns.reduce((acc, col) => acc + col.width + GAP, 0);
  });

  const maxScrollTop = computed(() => tap(state.data.dataHeight - state.data.bodyHeight, (v) => (v > 0 ? v : 0)));
  const maxScrollLeft = computed(() => tap(columnsWidth.value - state.data.bodyWidth, (v) => (v > 0 ? v : 0)));

  const dataDimensions = computed<DataWindow & { current?: DataWindow }>(() => {
    return {
      bodyHeight: data.bodyHeight,
      scrollTop: data.scrollTop,
      current: data.currentWindow,
    };
  });

  const tableColumns = useTableColumns({
    data,
    settings,
  });

  const tableRows = useTableRows(data, tableColumns);

  const adjustWidth = () => {
    const newWidth = data.columns.reduce((acc, col) => acc + col.width + GAP, 0);

    const rightOffset = data.bodyWidth + data.scrollLeft;

    if (newWidth < rightOffset) {
      const last = data.columns[data.columns.length - 1];
      last.width = last.width + (rightOffset - newWidth);
    }
  };

  const state = {
    data,
    settings,
    tableColumns,
    tableRows,
    adjustWidth,
    updateOffsets(ev: { deltaY: number; deltaX: number }) {
      this.updateScrollTop(data.scrollTop + ev.deltaY);
      this.updateScrollLeft(data.scrollLeft + ev.deltaX);
    },
    getSelectedRows(): Row[] {
      return data.rows.filter((row) => data.selectedRows.has(row.primaryKey));
    },
    getSelectedColumns(): ColumnSpecSettings[] {
      return data.columns.filter((col) => data.selectedColumns.has(col.id));
    },
    selectRow(rowId: PrimaryKey) {
      data.selectedRows.add(rowId);
    },
    unselectRow(rowId: PrimaryKey) {
      data.selectedRows.delete(rowId);
    },
    selectColumn(columnId: string) {
      data.selectedColumns.add(columnId);
    },
    unselectColumn(columnId: string) {
      data.selectedColumns.delete(columnId);
    },
    updateScrollTop(scrollTop: number) {
      data.scrollTop = clamp(scrollTop, 0, maxScrollTop.value);
    },
    updateScrollLeft(scrollLeft: number) {
      data.scrollLeft = clamp(scrollLeft, 0, maxScrollLeft.value);
    },
    updateBodyHeight() {
      const { height } = props.settings;
      const { dataHeight } = data;
      const bodyHeight = height > dataHeight ? dataHeight : height;
      data.bodyHeight = bodyHeight;
    },
    updateDimensions(rect: { height: number; width: number }) {
      this.updateBodyHeight();
      state.data.bodyWidth = rect.width;
      state.adjustWidth();
      data.rows = [];
      data.currentWindow = undefined;
    },
  };

  watch(
    dataDimensions,
    (n, _o) => {
      const current = n.current;

      const needToLoad = !current || n.scrollTop < current.scrollTop || n.scrollTop + n.bodyHeight > current.bodyHeight + current.scrollTop;

      if (needToLoad) {
        data.currentWindow = {
          scrollTop: n.scrollTop - WINDOW_DELTA,
          bodyHeight: n.bodyHeight + WINDOW_DELTA * 2,
        };
        loadRows(deepClone(data.currentWindow), settings.value.dataSource).then(({ rows, height, dataWindow }) => {
          if (deepEqual(data.currentWindow, dataWindow)) {
            data.rows = rows;
            data.dataHeight = height;
            setTimeout(() => {
              state.updateBodyHeight();
            }, 1);
          }
        });
      }
    },
    { deep: true, immediate: true },
  );

  provide(stateKey, state);

  return state;
}

export type State = ReturnType<typeof createState>;
