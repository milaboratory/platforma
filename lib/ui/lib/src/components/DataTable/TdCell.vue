<script lang="ts" setup>
import { showContextMenu } from '../contextMenu';
import type { ContextOption } from '../contextMenu/types';
import { injectState } from './keys';
import type { TableCell } from './types';
import { computed, reactive, ref, h } from 'vue';

const props = defineProps<{
  cell: TableCell;
}>();

const state = injectState();

const data = reactive({
  edit: false as boolean,
});

const render = computed(() => props.cell.column.render);

const onInput = (ev: Event) => {
  if (state.settings.value.onEditValue) {
    state.settings.value.onEditValue(props.cell, (ev.target as HTMLInputElement)?.value);
  }
  data.edit = false;
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

const onClick = () => {
  if (props.cell.column.editable) {
    data.edit = true;
    requestAnimationFrame(() => {
      cellRef.value?.querySelector('input')?.focus();
    });
  }
};

const DynamicComponent = computed(() => (render.value ? render.value(h, props.cell.value) : h('div', props.cell.value + '')));
</script>

<template>
  <div
    ref="cellRef"
    class="cell"
    :class="{ [cell.class]: true, edit: data.edit }"
    :data-row-index.attr="cell.row.index"
    @contextmenu="onContextMenu"
    @click="onClick"
  >
    <div v-if="cell.control">{{ cell.row.index }}</div>
    <input v-else-if="data.edit" :value="cell.value" @focusout="data.edit = false" @change="onInput" />
    <DynamicComponent v-else />
  </div>
</template>
