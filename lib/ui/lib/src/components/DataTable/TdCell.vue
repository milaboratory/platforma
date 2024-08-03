<script lang="ts" setup>
import { tapIf } from '@milaboratory/helpers';
import { showContextMenu } from '../contextMenu';
import type { ContextOption } from '../contextMenu/types';
import { injectState } from './keys';
import type { TableCell } from './types';
import { computed, ref } from 'vue';
import BaseCellComponent from './BaseCellComponent.vue';

const props = defineProps<{
  cell: TableCell;
}>();

const state = injectState();

const valueTypeRef = computed(() => props.cell.column.valueType);

const onInput = (value: unknown) => {
  tapIf(state.settings.value.onUpdatedRow, (f) => {
    const row = props.cell.row;

    const dataRow = { ...row.dataRow, [props.cell.id]: value };

    f({ ...row, dataRow });
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

const CustomComponent = computed(() => (props.cell.column.component ? props.cell.column.component() : undefined));
</script>

<template>
  <div ref="cellRef" class="cell" :class="{ [cell.class]: true }" :data-row-index.attr="cell.row.index" @contextmenu="onContextMenu">
    <div v-if="cell.control" class="control-cell">{{ cell.row.index }}</div>
    <component :is="CustomComponent" v-if="CustomComponent" :model-value="cell.value" @update:model-value="onInput" />
    <BaseCellComponent v-else :model-value="cell.value" :value-type="valueTypeRef" :editable="cell.column.editable" @update:model-value="onInput" />
  </div>
</template>
