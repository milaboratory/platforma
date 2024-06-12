<script lang="ts" setup>
import { columnEventOptions } from './constants';
import { useApi, rotate } from './domain';
import type { ColumnEvent, ColumnSettings } from './types';

const emit = defineEmits(['delete:column', 'expand:column', 'change:sort']);

const props = defineProps<{
  col: ColumnSettings;
  columnEvents?: ColumnEvent[];
}>();

function onContextMenu(ev: Event) {
  ev.preventDefault();

  const columnEvents = props.columnEvents ?? [];

  const options = columnEventOptions.filter((opt) => columnEvents.includes(opt.value));

  if (!options.length) {
    return;
  }

  useApi().showOptions(options, (op) => {
    emit(op, props.col.id);
  });
}

function onSort(col: ColumnSettings) {
  const v = col.sort?.direction ?? 'DESC';
  emit('change:sort', {
    colId: col.id,
    direction: rotate(v, ['DESC', 'ASC']),
  });
}
</script>

<template>
  <div class="cell th-cell" :data-col-id.attr="col.id" :class="{ 'justify-center': col.justify, frozen: col.frozen }" @contextmenu="onContextMenu">
    <div v-if="col.valueType" :class="col.valueType" />
    {{ col.label }}
    <div v-if="col.sort" class="sort" :class="col.sort.direction" @click.stop="() => onSort(col)" />
  </div>
</template>
