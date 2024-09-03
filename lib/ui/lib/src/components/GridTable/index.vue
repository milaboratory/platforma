<script lang="ts" setup>
import './assets/style.scss';
import { computed, reactive, ref, unref, onMounted, nextTick, watchPostEffect } from 'vue';
import TdCell from './TdCell.vue';
import type { Settings, Data } from './types';
import { useResize } from './useResize';
import { utils, strings } from '@milaboratory/helpers';
import AddColumnBtn from './AddColumnBtn.vue';
import TableIcon from './assets/TableIcon.vue';
import ThCell from './ThCell.vue';
import TRow from './TRow.vue';
import { compareRecords } from './domain';
import { throttle } from '@/helpers/utils';
import { useEventListener } from '@/index';

const minRowHeight = 40;

const { tapIf, tap } = utils;

const { uniqueId } = strings;

defineEmits(['click:cell', 'delete:row', 'delete:column', 'change:sort', 'update:value']);

const props = defineProps<{
  settings: Settings;
}>();

const data = reactive<Data>({
  rowIndex: -1,
  columnsMeta: {},
  resize: false,
  resizeTh: undefined,
  bodyHeight: 0,
  scrollTop: 0,
});

const tableRef = ref<HTMLElement>();
const headRef = ref<HTMLElement>();
const bodyRef = ref<HTMLElement>();

const updateBodyHeight = () => {
  tapIf(bodyRef.value, (el) => {
    data.bodyHeight = el.getBoundingClientRect().height;
  });
};

const columnsRef = computed(() => {
  if (props.settings.autoLastColumn) {
    return [...props.settings.columns, { name: uniqueId(), text: '_' }];
  }

  return props.settings.columns;
});

const gridTemplateColumns = computed(() => {
  const { columnsMeta } = data;
  const columns = unref(columnsRef);
  const hasMeta = Object.keys(columnsMeta).length;
  return columns
    .map((col, index) => {
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
    })
    .join(' ');
});

const noDataStyle = computed(() => ({
  gridColumn: '1 / ' + unref(columnsRef).length + 1,
}));

const classes = computed(() => {
  return unref(columnsRef).reduce(
    (r, col) => {
      r[col.name] = col.justify ? 'justify-' + col.justify : '';
      return r;
    },
    {} as Record<string, string>,
  );
});

const rows = computed(() => {
  const columns = unref(columnsRef);

  const rows = props.settings.rows.slice();

  const { bodyHeight, scrollTop } = data;

  if (props.settings.selfSort) {
    const sorts = columns.reduce(
      (acc, col) => {
        if (col.sort?.direction) {
          acc[col.name] = col.sort.direction;
        }
        return acc;
      },
      {} as Record<string, 'DESC' | 'ASC'>,
    );

    if (Object.keys(sorts).length) {
      rows.sort((a, b) => compareRecords(sorts, a, b));
    }
  }

  const safeGap = 160; // @TODO

  let offset = 0;

  return rows.map((row, rowIndex) => {
    const height = tap(row['__height'] ? Number(row['__height']) : minRowHeight, (n) => {
      return !Number.isFinite(n) || n < minRowHeight ? minRowHeight : n;
    });

    const cells = columns.map((col) => {
      const colName = col.name;
      return {
        colName,
        rowIndex,
        value: row[colName],
        class: classes.value[colName] + (rowIndex === data.rowIndex ? ' hovered' : ''),
        slot: col.slot,
        editable: col.editable,
      };
    });

    const visible = bodyHeight ? scrollTop < offset + height + safeGap && offset < bodyHeight + scrollTop + safeGap : false;

    offset += height + 1;

    return {
      visible,
      height,
      cells,
    };
  });
});

const { mouseDown } = useResize(data, tableRef);

function syncScroll() {
  tapIf(headRef.value, (el) => {
    el.scrollLeft = bodyRef.value?.scrollLeft ?? 0;
  });
}

const updateScrollTop = throttle(() => {
  data.scrollTop = bodyRef.value?.scrollTop ?? 0;
}, 10);

const onBodyScroll = () => {
  syncScroll();
  updateScrollTop();
};

function onExpand(colName: string) {
  const index = columnsRef.value.findIndex((col) => col.name === colName);
  if (index < 0) {
    return;
  }
  const width = props.settings.rows.reduce((width, row) => {
    const length = utils.call(() => {
      const value = row[colName];

      if (value && typeof value === 'object' && 'segments' in value) {
        const segments = value['segments'] as { sequence: string }[];
        return segments.map((s) => s.sequence).join('').length;
      }

      return String(value ?? '').length;
    });
    const w = 9.52 * length;
    return w > width ? w : width;
  }, 0);
  data.columnsMeta[index] = { width };
}

onMounted(() => {
  nextTick(updateBodyHeight);
});

watchPostEffect(() => {
  unref(props.settings);
  nextTick(updateBodyHeight);
});

useEventListener(window, 'resize', () => nextTick(updateBodyHeight));
</script>

<template>
  <div ref="tableRef" class="grid-table" @mousedown="mouseDown">
    <AddColumnBtn v-if="settings.addColumn" @click.stop="settings.addColumn" />
    <div ref="headRef" class="table-head" :style="{ gridTemplateColumns }">
      <ThCell
        v-for="(col, i) in columnsRef"
        :key="i"
        :col="col"
        :show-context-options="settings.showContextOptions"
        :column-events="settings.columnEvents"
        @delete:column="$emit('delete:column', $event)"
        @change:sort="$emit('change:sort', $event)"
        @expand:column="onExpand($event)"
      />
    </div>
    <div ref="bodyRef" class="table-body" @scroll="onBodyScroll">
      <div v-if="rows.length === 0" class="table-body__no-data" :style="noDataStyle">
        <div>
          <TableIcon />
          <div>No Data To Show</div>
        </div>
      </div>
      <TRow v-for="(row, i) in rows" :key="i" :visible="row.visible" :height="row.height" :index="i" :style="{ gridTemplateColumns }">
        <TdCell
          v-for="(cell, k) in row.cells"
          :key="k"
          :cell="cell"
          :show-context-options="settings.showContextOptions"
          :cell-events="settings.cellEvents"
          @click.stop="$emit('click:cell', cell)"
          @delete:row="$emit('delete:row', $event)"
          @update:value="$emit('update:value', $event)"
        >
          <slot v-if="cell.slot" :name="cell.colName" v-bind="cell">
            {{ cell.value }}
          </slot>
          <slot v-else v-bind="cell">{{ cell.value }}</slot>
        </TdCell>
      </TRow>
    </div>
  </div>
</template>
