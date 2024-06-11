<script lang="ts" setup>
import { cellEventOptions } from './constants';
import { useApi } from './domain';
import type { CellEvent, CellProps } from './types';
import { reactive, ref } from 'vue';

const emit = defineEmits(['delete:row', 'update:value']);

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

function showContextMenu(ev: Event) {
  ev.preventDefault();
  console.log('showContextMenu');
  const cellEvents = props.cellEvents ?? [];

  const options = cellEventOptions.filter((opt) => cellEvents.includes(opt.value));

  if (!options.length) {
    console.log('No options');
    return;
  }

  useApi().showOptions(options, (op) => {
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
    :class="{ [cell.class]: true, edit: data.edit }"
    :data-row-index.attr="cell.rowIndex"
    @contextmenu="showContextMenu"
    @click.stop="onClick"
  >
    <input v-if="data.edit" :value="cell.value" @focusout="data.edit = false" @change="onInput" />
    <slot v-else />
  </div>
</template>
