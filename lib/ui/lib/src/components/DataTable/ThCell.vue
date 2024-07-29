<script lang="ts" setup>
import { showContextMenu } from '../contextMenu';
import type { ContextOption } from '../contextMenu/types';
import { rotate } from './domain';
import type { ColumnSpec } from './types';

const emit = defineEmits(['delete:column', 'expand:column', 'change:sort']);

defineProps<{
  col: ColumnSpec;
}>();

function onContextMenu(ev: MouseEvent) {
  ev.preventDefault();

  const options = [] as ContextOption[]; // @TODO

  if (!options.length) {
    return;
  }

  showContextMenu(ev, options);
}

function onSort(col: ColumnSpec) {
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
