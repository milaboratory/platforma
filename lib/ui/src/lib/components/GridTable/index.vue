<script lang="ts" setup>
import './assets/style.scss';
import {computed, reactive, ref, unref} from 'vue';
import TdCell from './TdCell.vue';
import type {Settings, Data} from './types';
import {useResize} from './useResize';
import {utils, strings} from '@milaboratory/helpers';
import AddColumnBtn from './AddColumnBtn.vue';
import TableIcon from './assets/TableIcon.vue';
import ThCell from './ThCell.vue';

const {tapIf} = utils;

const {uniqueId} = strings;

defineEmits([
  'click:cell',
  'delete:row',
  'delete:column',
  'change:sort',
  'update:value'
]);

const props = defineProps<{
  settings: Settings
}>();

const data = reactive<Data>({
  rowIndex: -1,
  columnsMeta: {},
  resize: false,
  resizeTh: undefined
});

const columnsRef = computed(() => {
  if (props.settings.autoLastColumn) {
    return [...props.settings.columns, {name: uniqueId(), text: '_'}];
  }

  return props.settings.columns;
});

const gridTemplateColumns = computed(() => {
  const {columnsMeta} = data;
  const columns = unref(columnsRef);
  const hasMeta = Object.keys(columnsMeta).length;
  return columns.map((col, index) => {
    if (index == columns.length - 1) {
      if (hasMeta) {
        return 'minmax(100px, 1fr)';
      }

      return col.width ?? 'minmax(100px, 1fr)';
    }
    if (columnsMeta[index]) {
      return columnsMeta[index].width + 'px';
    }
    return col.width ?? '140px';
  }).join(' ');
});

const noDataStyle = computed(() => ({
  gridColumn: '1 / ' + unref(columnsRef).length + 1
}));

const classes = computed(() => {
  return unref(columnsRef).reduce((r, col) => {
    r[col.name] = col.justify ? 'justify-' + col.justify : '';
    return r;
  }, {} as Record<string, string>);
});

const tableRef = ref<HTMLElement>();

const cells = computed(() => props.settings.rows.flatMap((row, rowIndex) => {
  return unref(columnsRef).map(col => {
    const colName = col.name;
    return {
      colName,
      rowIndex,
      value: row[colName],
      class: classes.value[colName] + (rowIndex === data.rowIndex ? ' hovered' : ''),
      slot: col.slot,
      editable: col.editable
    };
  });
}));

const {mouseDown} = useResize(data, tableRef);

function syncScroll(selector: string) {
  return function (e: Event) {
    tapIf(unref(tableRef)?.querySelector(selector), el => {
      const t = (e.currentTarget as HTMLElement);
      el.scrollLeft = t.scrollLeft;
    });
  };
}

const syncBody = syncScroll('.table-head');

function onExpand(colName: string) {
  const index = columnsRef.value.findIndex(col => col.name === colName);
  if (index < 0) {
    return;
  }
  const width = props.settings.rows.reduce((width, row) => {
    const length = utils.call(() => {
      const value = row[colName];
      if (value && typeof value === 'object' && ('segments' in value)) {
        const segments = value['segments'] as {sequence: string}[];
        return segments.map(s => s.sequence).join('').length;
      }

      return String(value ?? '').length;
    });
    const w = 9.52 * length;
    return w > width ? w : width;
  }, 0);
  data.columnsMeta[index] = {width};
}
</script>

<template>
  <div ref="tableRef" class="grid-table" @mousedown="mouseDown">
    <add-column-btn v-if="settings.addColumn" @click.stop="settings.addColumn"/>
    <div
      class="table-head"
      :style="{gridTemplateColumns}"
    >
      <th-cell
        v-for="(col, i) in columnsRef"
        :key="i"
        :col="col"
        @delete:column="$emit('delete:column', $event)"
        @change:sort="$emit('change:sort', $event)"
        @expand:column="onExpand($event)"
      />
    </div>
    <div
      class="table-body"
      :style="{gridTemplateColumns}"
      @scroll="syncBody"
    >
      <div v-if="cells.length === 0" class="table-body__no-data" :style="noDataStyle">
        <div>
          <table-icon/>
          <div>No Data To Show</div>
        </div>
      </div>
      <td-cell
        v-for="(cell, i) in cells"
        :key="i"
        :cell="cell"
        @click.stop="$emit('click:cell', cell)"
        @delete:row="$emit('delete:row', $event)"
        @update:value="$emit('update:value', $event)"
      >
        <slot v-if="cell.slot" :name="cell.colName" v-bind="cell">
          {{ cell.value }}
        </slot>
        <slot v-else v-bind="cell">{{ cell.value }}</slot>
      </td-cell>
    </div>
  </div>
</template>
