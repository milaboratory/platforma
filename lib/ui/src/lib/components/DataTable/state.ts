import { computed, provide, reactive, watch } from 'vue';
import type { TableProps, TableData, RowSettings } from './types';
import { deepClone } from '@milaboratory/helpers/objects';
import { stateKey } from './keys';
import { DEFAULT_ROW_HEIGHT } from './constants';
import { useColumns } from './composition/useColumns';

export function createState(props: TableProps) {
  const data = reactive<TableData>({
    rowIndex: -1,
    columns: [],
    resize: false,
    resizeTh: undefined,
    bodyHeight: 600,
    bodyWidth: 0,
    scrollTop: 0,
    scrollLeft: 0,
    selectedRows: new Set<string>(),
  });

  watch(
    () => props.settings.columns,
    () => {
      data.columns = deepClone(props.settings.columns);
    },
    { immediate: true },
  );

  const settings = computed(() => props.settings);

  const datum = computed(() => {
    const rowHeight = props.settings.rowHeight ?? DEFAULT_ROW_HEIGHT;

    const gap = props.settings.gap ?? 1;

    const raw = props.settings.datum.slice();

    return raw.map<RowSettings>((dataRow, index) => ({
      dataRow,
      index,
      offset: index * (rowHeight + gap),
      height: rowHeight,
    }));
  });

  const bodyHeight = computed(() => {
    return 600; // @TODO
  });

  const dataHeight = computed(() => {
    return datum.value.length * (DEFAULT_ROW_HEIGHT + 1);
  });

  const state = { data, settings, datum, bodyHeight, dataHeight };

  provide(stateKey, state);

  return state;
}

export type State = ReturnType<typeof createState>;
