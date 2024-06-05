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
import { throttle } from '@/lib/helpers/utils';
import { useEventListener } from '@/lib';
import { DEFAULT_ROW_HEIGHT } from './constants';
import { clamp } from '@milaboratory/helpers/utils';

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

const transformRowStyle = computed(() => {
  const off = -Math.round(data.scrollTop % (DEFAULT_ROW_HEIGHT + 1));
  return {
    transform: `translateY(${off}px)`,
    gridTemplateColumns: gridTemplateColumns.value,
  };
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

  let offset = 0;

  return rows
    .map((row, rowIndex) => {
      const height = tap(DEFAULT_ROW_HEIGHT, (n) => {
        return !Number.isFinite(n) || n < DEFAULT_ROW_HEIGHT ? DEFAULT_ROW_HEIGHT : n;
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

      const visible = bodyHeight ? scrollTop < offset + height && offset < bodyHeight + scrollTop : false;

      offset += height + 1;

      return {
        visible,
        height,
        cells,
      };
    })
    .filter((r) => r.visible);
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

// const onBodyScroll = () => {
//   syncScroll();
//   updateScrollTop();
// };

onMounted(() => {
  nextTick(updateBodyHeight);
});

watchPostEffect(() => {
  unref(props.settings);
  nextTick(updateBodyHeight);
});

useEventListener(window, 'resize', () => nextTick(updateBodyHeight));

const clientHeight = computed(() => {
  return 800;
});

const scrollHeight = computed(() => {
  return props.settings.rows.length * (DEFAULT_ROW_HEIGHT + 1);
});

const maxOffsetTop = computed(() => scrollHeight.value - clientHeight.value);

function onWheel(ev: WheelEvent) {
  if (ev.deltaY !== 0) {
    ev.preventDefault();
    console.log('prevented');
  } else {
    console.log('not prevented', ev.deltaX);
  }
  data.scrollTop = clamp(data.scrollTop + ev.deltaY, 0, maxOffsetTop.value);
}
</script>

<template>
  <div ref="tableRef" class="data-table" @mousedown="mouseDown">
    <add-column-btn v-if="settings.addColumn" @click.stop="settings.addColumn" />
    <div ref="headRef" class="table-head" :style="{ gridTemplateColumns }">
      <th-cell
        v-for="(col, i) in columnsRef"
        :key="i"
        :col="col"
        :show-context-options="settings.showContextOptions"
        :column-events="settings.columnEvents"
        @delete:column="$emit('delete:column', $event)"
        @change:sort="$emit('change:sort', $event)"
      />
    </div>
    <div ref="bodyRef" class="table-body" @wheel="onWheel">
      <div v-if="rows.length === 0" class="table-body__no-data" :style="noDataStyle">
        <div>
          <table-icon />
          <div>No Data To Show</div>
        </div>
      </div>
      <t-row v-for="(row, i) in rows" :key="i" :visible="row.visible" :height="row.height" :index="i" :style="transformRowStyle">
        <td-cell
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
        </td-cell>
      </t-row>
    </div>
  </div>
</template>
