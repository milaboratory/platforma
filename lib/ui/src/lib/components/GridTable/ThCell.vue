<script lang="ts" setup>
import type { ColumnSettings, ShowContextOptions } from './types';

const emit = defineEmits(['delete:column', 'expand:column', 'change:sort']);

const props = defineProps<{
  col: ColumnSettings;
  showContextOptions?: ShowContextOptions;
}>();

function rotate<T>(v: T, lst: T[]) {
  const next = lst.indexOf(v) + 1;
  return lst[next >= lst.length ? 0 : next];
}

function onContextMenu() {
  if (!props.showContextOptions) {
    console.warn('inject showContextOptions interface for the table');
    return;
  }

  props.showContextOptions(
    [
      // {
      //   text: 'Delete column',
      //   value: 'delete:column', // todo
      // },
      {
        text: 'Fit content',
        value: 'expand:column',
      },
    ],
    (op) => {
      emit(op as 'delete:column' | 'expand:column' | 'change:sort', props.col.name);
    },
  );
}

function onSort(colName: string, _v: 'DESC' | 'ASC' | undefined) {
  const v = _v ?? 'DESC';
  emit('change:sort', {
    colName,
    direction: rotate(v, ['DESC', 'ASC']),
  });
}
</script>

<template>
  <div class="cell th-cell" :class="{ 'justify-center': col.justify }" @contextmenu="onContextMenu">
    <div v-if="col.valueType" :class="col.valueType" />
    {{ col.text }}
    <div v-if="col.sort" class="sort" :class="col.sort.direction" @click.stop="() => onSort(col.name, col.sort?.direction)" />
  </div>
</template>
