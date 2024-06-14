<script lang="ts" setup>
import './assets/style.scss';
import { computed, ref, unref, onMounted, nextTick, watchPostEffect, watch, provide } from 'vue';
import TdCell from './TdCell.vue';
import type { Settings, TableData, RowSettings } from './types';
import AddColumnBtn from './AddColumnBtn.vue';
import TableIcon from './assets/TableIcon.vue';
import TrHead from './TrHead.vue';
import ThCell from './ThCell.vue';
import TrBody from './TrBody.vue';
import { useEventListener } from '@/lib';
import { DEFAULT_ROW_HEIGHT } from './constants';
import { clamp, tapIf } from '@milaboratory/helpers/utils';
import { useResize } from './composition/useResize';
import { useRows } from './composition/useRows';
import { useColumns } from './composition/useColumns';
import CommandMenu from './CommandMenu.vue';
import { createState } from './state';

const emit = defineEmits<{
  (e: 'click:cell', cell: unknown): void;
  (e: 'update:data', value: TableData): void;
  (e: 'delete:column', value: unknown): void;
  (e: 'change:sort', value: unknown): void;
}>();

const props = defineProps<{
  settings: Settings;
}>();

const state = createState(props);

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

watch(state.data, (v) => emit('update:data', v), { deep: true });

watch(props, () => updateDimensions);

const tableRef = ref<HTMLElement>();
const headRef = ref<HTMLElement>();
const bodyRef = ref<HTMLElement>();

const updateDimensions = () => {
  tapIf(bodyRef.value, (el) => {
    const rect = el.getBoundingClientRect();
    state.data.bodyHeight = rect.height;
    state.data.bodyWidth = rect.width;
  });
};

const columns = useColumns(state);

const rows = useRows(state.data, { columns, datum, settings: state.settings });

const { mouseDown } = useResize(state.data, tableRef);

onMounted(() => {
  nextTick(updateDimensions);
});

watchPostEffect(() => {
  unref(props.settings);
  nextTick(updateDimensions);
});

useEventListener(window, 'resize', () => nextTick(updateDimensions));

const bodyHeight = computed(() => {
  return 600; // @TODO
});

const dataHeight = computed(() => {
  return datum.value.length * (DEFAULT_ROW_HEIGHT + 1);
});

const columnsWidth = computed(() => {
  return props.settings.columns.reduce((acc, col) => acc + col.width + 1, 0);
});

const maxScrollTop = computed(() => dataHeight.value - state.data.bodyHeight);
const maxScrollLeft = computed(() => (columnsWidth.value > state.data.bodyWidth ? columnsWidth.value - state.data.bodyWidth : 0));

const onWheel = (ev: WheelEvent) => {
  ev.preventDefault();
  state.data.scrollTop = clamp(state.data.scrollTop + ev.deltaY, 0, maxScrollTop.value);
  state.data.scrollLeft = clamp(state.data.scrollLeft + ev.deltaX, 0, maxScrollLeft.value);
};
</script>

<template>
  <div ref="tableRef" class="data-table" @mousedown="mouseDown">
    <CommandMenu :table-data="state.data" />
    <add-column-btn v-if="settings.addColumn" @click.stop="settings.addColumn" />
    <div ref="headRef" class="table-head">
      <tr-head>
        <th-cell
          v-for="(col, i) in columns"
          :key="i"
          :col="col"
          :style="col.style"
          :column-events="settings.columnEvents"
          @delete:column="$emit('delete:column', $event)"
          @change:sort="$emit('change:sort', $event)"
        />
      </tr-head>
    </div>
    <div ref="bodyRef" class="table-body" :style="{ height: bodyHeight + 'px' }" @wheel="onWheel">
      <div v-if="rows.length === 0" class="table-body__no-data">
        <div>
          <table-icon />
          <div>No Data To Show</div>
        </div>
      </div>
      <tr-body v-for="(row, i) in rows" :key="i" :row="row">
        <td-cell
          v-for="cell in row.cells"
          :key="cell.column.id + i"
          :cell="cell"
          :table-data="state.data"
          :style="cell.style"
          @click.stop="$emit('click:cell', cell)"
        >
        </td-cell>
      </tr-body>
    </div>
  </div>
</template>
