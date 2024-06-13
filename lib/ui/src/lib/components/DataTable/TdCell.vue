<script lang="ts" setup>
import { showContextMenu } from '../contextMenu2';
import type { ContextOption } from '../contextMenu2/types';
import { settingsKey } from './keys';
import type { CellProps, TableData } from './types';
import { inject, reactive, ref } from 'vue';

const emit = defineEmits(['delete:row', 'update:value', 'select:row']);

const props = defineProps<{
  cell: CellProps;
  tableData: TableData;
}>();

const settings = inject(settingsKey)!;

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

const onContextMenu = (ev: MouseEvent) => {
  ev.preventDefault();

  const { operations } = settings?.value ?? {};

  const options = [] as ContextOption[];

  if (operations) {
    const { onDelete } = operations;
    if (onDelete) {
      options.push({
        text: 'Delete row',
        cb() {
          onDelete([props.cell.primaryKey]);
        },
      });

      options.push({
        text: 'Select row',
        cb() {
          props.tableData.selectedRows.add(settings.value.getPrimaryKey(props.cell.dataRow, props.cell.rowIndex));
        },
      });
    }
  }

  if (!options.length) {
    return;
  }

  showContextMenu(ev, options);
};

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
    <div v-if="cell.control">{{ cell.rowIndex }}</div>
    <input v-else-if="data.edit" :value="cell.value" @focusout="data.edit = false" @change="onInput" />
    <slot v-else />
  </div>
</template>
