<script lang="ts" setup>
import { cellEventOptions } from './constants';
import type { CellEvent, CellProps, ShowContextOptions } from './types';
import { reactive, ref } from 'vue';

const emit = defineEmits(['delete:row', 'update:value']);

const props = defineProps<{
  cell: CellProps;
  showContextOptions?: ShowContextOptions;
  cellEvents?: CellEvent[];
}>();

const data = reactive({
  edit: false as boolean,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onInput(ev: any) {
  emit('update:value', {
    rowIndex: props.cell.rowIndex,
    name: props.cell.colName,
    value: ev.target.value,
  });
  data.edit = false;
}

function showContextMenu() {
  const cellEvents = props.cellEvents ?? [];

  if (!props.showContextOptions) {
    console.warn('inject showContextOptions interface for the table');
    return;
  }

  const options = cellEventOptions.filter((opt) => cellEvents.includes(opt.value));

  if (!options.length) {
    return;
  }

  props.showContextOptions(options, (op) => {
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
