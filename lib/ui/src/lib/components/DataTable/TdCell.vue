<script lang="ts" setup>
import { showContextMenu } from '../contextMenu';
import { cellEventOptions } from './constants';
import type { CellEvent, CellProps } from './types';
import { reactive, ref } from 'vue';

const emit = defineEmits(['delete:row', 'update:value', 'select:row']);

const props = defineProps<{
  cell: CellProps;
  cellEvents?: CellEvent[];
}>();

const data = reactive({
  edit: false as boolean,
});

const onInput = (ev: Event) => {
  emit('update:value', {
    rowIndex: props.cell.rowIndex,
    colId: props.cell.column.id,
    value: (ev.target as HTMLInputElement)?.value,
  });
  data.edit = false;
};

function onContextMenu(ev: MouseEvent) {
  ev.preventDefault();
  const cellEvents = props.cellEvents ?? [];

  const options = cellEventOptions.filter((opt) => cellEvents.includes(opt.value));

  if (!options.length) {
    return;
  }

  showContextMenu(ev, options, (op) => {
    emit(op, props.cell.rowIndex);
  });
}

const cellRef = ref<HTMLElement>();

function onClick() {
  if (props.cell.editable) {
    data.edit = true;
    requestAnimationFrame(() => {
      cellRef.value?.querySelector('input')?.focus();
    });
  }
}
</script>

<template>
  <div
    ref="cellRef"
    class="cell"
    :class="{ [cell.class]: true, edit: data.edit, frozen: cell.column.frozen }"
    :data-row-index.attr="cell.rowIndex"
    @contextmenu="onContextMenu"
    @click.stop="onClick"
  >
    <input v-if="data.edit" :value="cell.value" @focusout="data.edit = false" @change="onInput" />
    <slot v-else />
  </div>
</template>
