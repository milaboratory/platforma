<script lang="ts" setup>
import './assets/data-table-style.scss';
import { ref, unref, onMounted, nextTick, watchPostEffect, watch, computed } from 'vue';
import TdCell from './TdCell.vue';
import type { TableSettings, TableData } from './types';
import TableIcon from './assets/TableIcon.vue';
import TrHead from './TrHead.vue';
import ThCell from './ThCell.vue';
import TrBody from './TrBody.vue';
import ColumnCaret from './ColumnCaret.vue';
import { useEventListener } from '../../index';
import { tapIf } from '@milaboratories/helpers';
import { useResize } from './composition/useResize';
import RowsCommandMenu from './RowsCommandMenu.vue';
import ColumnsCommandMenu from './ColumnsCommandMenu.vue';
import TScroll from './TScroll.vue';
import { createState } from './state';

const emit = defineEmits<{
  (e: 'update:data', value: TableData): void;
  (e: 'change:sort', value: unknown): void;
}>();

const props = defineProps<{
  settings: Readonly<TableSettings>;
}>();

const state = createState(props);

const hasNoData = computed(() => state.data.rows.length === 0);

const tableBodyStyle = computed(() => ({
  height: hasNoData.value ? '212px' /* css value */ : state.data.bodyHeight + 'px',
}));

watch(state.data, (v) => emit('update:data', v), { deep: true });

watch(props, () => updateDimensions);

const tableRef = ref<HTMLElement>();
const headRef = ref<HTMLElement>();
const bodyRef = ref<HTMLElement>();

const updateDimensions = () => {
  tapIf(bodyRef.value, (el) => {
    state.updateDimensions(el.getBoundingClientRect());
  });
};

const tableColumns = state.tableColumns;

const tableRows = state.tableRows;

const { mouseDown } = useResize(state, tableRef);

onMounted(() => {
  nextTick(updateDimensions);
});

watchPostEffect(() => {
  unref(props.settings);
  nextTick(updateDimensions);
});

useEventListener(window, 'resize', () => nextTick(updateDimensions));

const onWheel = (ev: WheelEvent) => {
  ev.preventDefault();
  state.updateOffsets(ev);
};
</script>

<template>
  <div ref="tableRef" class="data-table" @mousedown="mouseDown">
    <div class="command-menu__container">
      <RowsCommandMenu />
      <ColumnsCommandMenu />
    </div>
    <div ref="headRef" class="table-head">
      <TrHead>
        <ThCell v-for="(col, i) in tableColumns" :key="i" :col="col" :style="col.style" @change:sort="$emit('change:sort', $event)" />
      </TrHead>
    </div>
    <div ref="bodyRef" class="table-body" :style="tableBodyStyle" @wheel="onWheel">
      <div v-if="hasNoData" class="table-body__no-data">
        <div>
          <TableIcon />
          <div>No Data To Show</div>
        </div>
      </div>
      <TrBody v-for="(row, i) in tableRows" :key="i" :row="row">
        <TdCell v-for="cell in row.cells" :key="cell.column.id + ':' + i" :cell="cell" :style="cell.style" />
      </TrBody>
    </div>
    <div class="carets">
      <ColumnCaret v-for="(col, i) in tableColumns" :key="i" :column="col" :style="col.style" @change:sort="$emit('change:sort', $event)" />
    </div>
    <TScroll
      :offset="state.data.scrollTop"
      :window-size="state.data.bodyHeight"
      :data-size="state.data.dataHeight"
      @change:offset="state.updateScrollTop"
    />
  </div>
</template>
