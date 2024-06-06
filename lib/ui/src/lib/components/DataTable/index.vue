<script lang="ts" setup>
import './assets/style.scss';
import { computed, reactive, ref, unref, onMounted, nextTick, watchPostEffect, watch } from 'vue';
import TdCell from './TdCell.vue';
import type { Settings, Data } from './types';
import { useResize } from './useResize';
import AddColumnBtn from './AddColumnBtn.vue';
import TableIcon from './assets/TableIcon.vue';
import ThRow from './ThRow.vue';
import ThCell from './ThCell.vue';
import TRow from './TRow.vue';
import { useEventListener } from '@/lib';
import { DEFAULT_ROW_HEIGHT } from './constants';
import { clamp, tapIf } from '@milaboratory/helpers/utils';
import { useRows } from './useRows';

const emit = defineEmits<{
  (e: 'click:cell', cell: unknown): void;
  (e: 'update:value', value: unknown): void;
  (e: 'update:data', value: Data): void;
  (e: 'delete:column', value: unknown): void;
  (e: 'delete:row', value: unknown): void;
  (e: 'change:sort', value: unknown): void;
}>();

const props = defineProps<{
  settings: Settings;
}>();

const data = reactive<Data>({
  rowIndex: -1,
  columnsMeta: {},
  resize: false,
  resizeTh: undefined,
  bodyHeight: 0,
  bodyWidth: 0,
  scrollTop: 0,
  scrollLeft: 0,
});

watch(data, (v) => emit('update:data', v), { deep: true });

watch(props, () => updateSizes);

const tableRef = ref<HTMLElement>();
const headRef = ref<HTMLElement>();
const bodyRef = ref<HTMLElement>();

const updateSizes = () => {
  tapIf(bodyRef.value, (el) => {
    const rect = el.getBoundingClientRect();
    data.bodyHeight = rect.height;
    data.bodyWidth = rect.width;
  });
};

const columnsRef = computed(() => {
  const { columnsMeta } = data;
  const { columns } = props.settings;

  const all = [...columns].map((col, i) => ({ ...col, width: columnsMeta[i]?.['width'] ?? col.width }));

  const lastWidth = data.bodyWidth - all.reduce((r, col) => r + col.width, 0);

  if (lastWidth > 0) {
    all[all.length - 1].width = lastWidth;
  }

  return all;
});

// const gridTemplateColumns = useTemplateComlumns(data, columnsRef);

const headStyle = computed(() => {
  const offX = -Math.round(data.scrollLeft);
  return {
    transform: `translateX(${offX}px)`,
  };
});

const rowStyle = computed(() => {
  const offY = -Math.round(data.scrollTop % (DEFAULT_ROW_HEIGHT + 1));
  const offX = -Math.round(data.scrollLeft);
  return {
    transform: `translate(${offX}px, ${offY}px)`,
  };
});

const noDataStyle = computed(() => ({
  gridColumn: '1 / ' + unref(columnsRef).length + 1,
}));

const rows = useRows(props, data, columnsRef);

const { mouseDown } = useResize(data, tableRef);

onMounted(() => {
  nextTick(updateSizes);
});

watchPostEffect(() => {
  unref(props.settings);
  nextTick(updateSizes);
});

useEventListener(window, 'resize', () => nextTick(updateSizes));

const bodyHeight = computed(() => {
  return 600;
});

const scrollHeight = computed(() => {
  return props.settings.rows.length * (DEFAULT_ROW_HEIGHT + 1);
});

const scrollWidth = computed(() => {
  return props.settings.columns.reduce((acc, col) => acc + col.width, 0);
});

const maxScrollTop = computed(() => scrollHeight.value - data.bodyHeight);
const maxScrollLeft = computed(() => (scrollWidth.value > data.bodyWidth ? scrollWidth.value - data.bodyWidth : 0));

const onWheel = (ev: WheelEvent) => {
  ev.preventDefault();
  data.scrollTop = clamp(data.scrollTop + ev.deltaY, 0, maxScrollTop.value);
  data.scrollLeft = clamp(data.scrollLeft + ev.deltaX, 0, maxScrollLeft.value);
};
</script>

<template>
  <div ref="tableRef" class="data-table" @mousedown="mouseDown">
    <add-column-btn v-if="settings.addColumn" @click.stop="settings.addColumn" />
    <div ref="headRef" class="table-head">
      <th-row :style="headStyle">
        <th-cell
          v-for="(col, i) in columnsRef"
          :key="i"
          :col="col"
          :style="{ width: col.width + 'px' }"
          :show-context-options="settings.showContextOptions"
          :column-events="settings.columnEvents"
          @delete:column="$emit('delete:column', $event)"
          @change:sort="$emit('change:sort', $event)"
        />
      </th-row>
    </div>
    <div ref="bodyRef" class="table-body" :style="{ height: bodyHeight + 'px' }" @wheel="onWheel">
      <div v-if="rows.length === 0" class="table-body__no-data" :style="noDataStyle">
        <div>
          <table-icon />
          <div>No Data To Show</div>
        </div>
      </div>
      <t-row v-for="(row, i) in rows" :key="i" :visible="row.visible" :height="row.height" :index="i" :style="rowStyle">
        <td-cell
          v-for="(cell, k) in row.cells"
          :key="k"
          :cell="cell"
          :show-context-options="settings.showContextOptions"
          :cell-events="settings.cellEvents"
          :style="{ width: cell.width + 'px' }"
          @click.stop="$emit('click:cell', cell)"
          @delete:row="$emit('delete:row', $event)"
          @update:value="$emit('update:value', $event)"
        >
          <slot v-if="cell.slot" :name="cell.colName" v-bind="cell">
            {{ cell.value }}
          </slot>
          <slot v-else v-bind="cell">{{ cell.value }}</slot>
        </td-cell>
      </t-row>
    </div>
  </div>
</template>
