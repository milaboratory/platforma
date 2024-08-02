<script lang="ts" setup>
import { tapIf } from '@milaboratory/helpers';
import { showContextMenu } from '../contextMenu';
import type { ContextOption } from '../contextMenu/types';
import { injectState } from './keys';
import type { TableCell } from './types';
import { computed, ref, h } from 'vue';
import BaseCellComponent from './BaseCellComponent.vue';

const props = defineProps<{
  cell: TableCell;
}>();

const state = injectState();

const render = computed(() => props.cell.column.render);

const valueTypeRef = computed(() => props.cell.column.valueType);

const onInput = (value: unknown) => {
  tapIf(state.settings.value.onEditValue, (f) => {
    f({ ...props.cell, value });
  });
};

const onContextMenu = (ev: MouseEvent) => {
  if (ev.type === 'contextmenu') {
    ev.preventDefault();
  }

  const settings = state.settings ?? {};

  const options = [] as ContextOption[];

  const { onSelectedRows, onSelectedColumns } = settings.value;

  if (onSelectedRows && onSelectedRows.length) {
    options.push({
      text: 'Select row',
      cb() {
        state.selectRow(props.cell.row.primaryKey);
      },
    });

    options.push({
      text: 'Deselect row',
      cb() {
        state.data.selectedRows.delete(props.cell.row.primaryKey);
      },
    });
  }

  if (onSelectedColumns && onSelectedColumns.length) {
    options.push({
      text: 'Select column',
      cb() {
        state.selectColumn(props.cell.column.id);
      },
    });

    options.push({
      text: 'Unselect column',
      cb() {
        state.unselectColumn(props.cell.column.id);
      },
    });
  }

  if (!options.length) {
    return;
  }

  showContextMenu(ev, options);
};

const cellRef = ref<HTMLElement>();

const DynamicComponent = computed(() => (render.value ? render.value(h, props.cell.value) : undefined));
</script>

<template>
  <div ref="cellRef" class="cell" :class="{ [cell.class]: true }" :data-row-index.attr="cell.row.index" @contextmenu="onContextMenu">
    <div v-if="cell.control">{{ cell.row.index }}</div>
    <DynamicComponent v-if="DynamicComponent" />
    <BaseCellComponent v-else :model-value="cell.value" :value-type="valueTypeRef" :editable="cell.column.editable" @update:model-value="onInput" />
  </div>
</template>
