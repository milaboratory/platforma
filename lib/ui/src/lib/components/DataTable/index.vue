<script lang="ts" setup>
import './assets/style.scss';
import { computed, reactive, ref, unref, onMounted, nextTick, watchPostEffect, watch } from 'vue';
import TdCell from './TdCell.vue';
import type { Settings, Data, RowSettings } from './types';
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
import { deepClone } from '@milaboratory/helpers/objects';
import { useColumns } from './composition/useColumns';

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
  columns: [],
  rows: [],
  resize: false,
  resizeTh: undefined,
  bodyHeight: 0,
  bodyWidth: 0,
  scrollTop: 0,
  scrollLeft: 0,
});

watch(
  () => props.settings.columns,
  () => {
    data.columns = deepClone(props.settings.columns);
  },
  { immediate: true },
);

const datum = computed(() => {
  const rowHeight = props.settings.rowHeight ?? DEFAULT_ROW_HEIGHT;

  const gap = props.settings.gap ?? 1;

  const raw = props.settings.datum.slice();

  // if (props.settings.selfSort) {
  //   sortRows(columns, raw);
  // }

  console.log('datum updated');

  return raw.map<RowSettings>((values, index) => ({
    values,
    index,
    offset: index * (rowHeight + gap),
    height: rowHeight,
  }));
});

// watch(
//   () => props.settings.datum,
//   () => {
//     const rowHeight = props.settings.rowHeight ?? DEFAULT_ROW_HEIGHT;

//     const gap = props.settings.gap ?? 1;

//     const raw = props.settings.datum.slice();

//     if (props.settings.selfSort) {
//       // sortRows(columns, raw);
//     }

//     console.log('datum updated');

//     data.rows = Object.freeze(
//       raw.map<RowSettings>((values, index) => ({
//         values,
//         index,
//         offset: index * (rowHeight + gap),
//         height: rowHeight,
//       })),
//     );
//   },
//   { immediate: true, deep: true },
// );

watch(data, (v) => emit('update:data', v), { deep: true });

watch(props, () => updateDimensions);

const tableRef = ref<HTMLElement>();
const headRef = ref<HTMLElement>();
const bodyRef = ref<HTMLElement>();

const updateDimensions = () => {
  console.log('update');
  tapIf(bodyRef.value, (el) => {
    const rect = el.getBoundingClientRect();
    data.bodyHeight = rect.height;
    data.bodyWidth = rect.width;
  });
};

const noDataStyle = computed(() => ({
  gridColumn: '1 / ' + data.columns.length + 1,
}));

const columns = useColumns(data);

const rows = useRows(data, columns, datum);

const { mouseDown } = useResize(data, tableRef);

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

const maxScrollTop = computed(() => dataHeight.value - data.bodyHeight);
const maxScrollLeft = computed(() => (columnsWidth.value > data.bodyWidth ? columnsWidth.value - data.bodyWidth : 0));

const onWheel = (ev: WheelEvent) => {
  ev.preventDefault();
  data.scrollTop = clamp(data.scrollTop + ev.deltaY, 0, maxScrollTop.value);
  data.scrollLeft = clamp(data.scrollLeft + ev.deltaX, 0, maxScrollLeft.value);
};
</script>

<template>
  <div ref="tableRef" class="data-table" @mousedown="mouseDown">
    <div>columnsWidth: {{ columnsWidth }}</div>
    <div>bodyWidth: {{ data.bodyWidth }}</div>
    <div>maxScrollLeft: {{ maxScrollLeft }}</div>
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
      <div v-if="rows.length === 0" class="table-body__no-data" :style="noDataStyle">
        <div>
          <table-icon />
          <div>No Data To Show</div>
        </div>
      </div>
      <tr-body v-for="(row, i) in rows" :key="i" :height="row.height" :index="i" :style="row.style">
        <td-cell
          v-for="cell in row.cells"
          :key="cell.column.id"
          :cell="cell"
          :cell-events="settings.cellEvents"
          :style="cell.style"
          @click.stop="$emit('click:cell', cell)"
          @delete:row="$emit('delete:row', $event)"
          @update:value="$emit('update:value', $event)"
        >
          <slot v-if="cell.slot" :name="cell.column.id" v-bind="cell">
            {{ cell.value }}
          </slot>
          <slot v-else v-bind="cell">{{ cell.value }}</slot>
        </td-cell>
      </tr-body>
    </div>
  </div>
</template>
