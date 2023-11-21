<script lang="ts" setup>
import type {CellProps} from './types';
import {reactive, ref} from 'vue';

const emit = defineEmits(['delete:row', 'update:value']);

const props = defineProps<{
  cell: CellProps
}>();

const data = reactive({
  edit: false as boolean
});

function onInput(ev: any) {
  emit('update:value', {
    rowIndex: props.cell.rowIndex,
    name: props.cell.colName,
    value: ev.target.value
  });
  data.edit = false;
}

function showContextMenu() {
  alert('@TODO context menu');
  // api.showOptions([{
  //   text: 'Delete row',
  //   value: 'delete-row'
  // }] as const, (op) => {
  //   if (op === 'delete-row') {
  //     emit('delete:row', props.cell.rowIndex);
  //   }
  // });
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
    :class="{[cell.class]: true, edit: data.edit}"
    :data-row-index.attr="cell.rowIndex"
    @contextmenu="showContextMenu"
    @click.stop="onClick"
  >
    <input v-if="data.edit" :value="cell.value" @focusout="data.edit = false" @change="onInput">
    <slot v-else/>
  </div>
</template>
