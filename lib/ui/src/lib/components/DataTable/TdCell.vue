<script lang="ts" setup>
import { showContextMenu } from '../contextMenu2';
import type { ContextOption } from '../contextMenu2/types';
import { injectState } from './keys';
import type { CellProps } from './types';
import { computed, reactive, ref, h } from 'vue';

const props = defineProps<{
  cell: CellProps;
}>();

const state = injectState();

const data = reactive({
  edit: false as boolean,
});

const render = computed(() => props.cell.column.render);

const onInput = (ev: Event) => {
  if (state.settings.value.onEdit) {
    state.settings.value.onEdit({
      rowId: props.cell.primaryKey,
      columnId: props.cell.column.id,
      value: (ev.target as HTMLInputElement)?.value,
    });
  }
  data.edit = false;
};

const onContextMenu = (ev: MouseEvent) => {
  if (ev.type === 'contextmenu') {
    ev.preventDefault();
  }

  const settings = state.settings.value ?? {};

  const options = [] as ContextOption[];

  const { onDeleteRows, onDeleteColumns } = settings;

  if (onDeleteRows) {
    options.push({
      text: 'Delete row',
      cb() {
        onDeleteRows([props.cell.primaryKey]);
      },
    });

    options.push({
      text: 'Select row',
      cb() {
        state.selectRow(state.settings.value.getPrimaryKey(props.cell.dataRow, props.cell.rowIndex));
      },
    });

    options.push({
      text: 'Deselect row',
      cb() {
        state.data.selectedRows.delete(state.settings.value.getPrimaryKey(props.cell.dataRow, props.cell.rowIndex));
      },
    });
  }

  if (onDeleteColumns) {
    options.push({
      text: 'Delete column',
      cb() {
        onDeleteColumns([props.cell.column.id]);
      },
    });

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
    :data-row-index.attr="cell.rowIndex"
    @contextmenu="onContextMenu"
    @click="onClick"
  >
    <div v-if="cell.control">{{ cell.rowIndex }}</div>
    <input v-else-if="data.edit" :value="cell.value" @focusout="data.edit = false" @change="onInput" />
    <DynamicComponent v-else />
  </div>
</template>
