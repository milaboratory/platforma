<script lang="ts" setup>
import type {ColumnSettings} from './types';

const emit = defineEmits(['delete:column', 'expand:column', 'change:sort']);

defineProps<{
  col: ColumnSettings
}>();

function rotate<T>(v: T, lst: T[]) {
  const next = lst.indexOf(v) + 1;
  return lst[next >= lst.length ? 0 : next];
}

function showContextMenu() {
  alert('@TODO context menu');
  // api.showOptions([{
  //   text: 'Delete column',
  //   value: 'delete:column'
  // }, {
  //   text: 'Fit content',
  //   value: 'expand:column'
  // }] as const, (op) => {
  //   emit(op, props.col.name);
  // });
}

function onSort(colName: string, _v: 'DESC' | 'ASC' | undefined) {
  const v = _v ?? 'DESC';
  emit('change:sort', {
    colName,
    direction: rotate(v, ['DESC', 'ASC'])
  });
}
</script>

<template>
  <div
    class="cell th-cell"
    :class="{'justify-center': col.justify}"
    @contextmenu="showContextMenu"
  >
    <div v-if="col.valueType" :class="col.valueType"/>
    {{ col.text }}
    <div v-if="col.sort" class="sort" :class="col.sort.direction" @click.stop="() => onSort(col.name, col.sort?.direction)"/>
  </div>
</template>
