<script lang="ts" setup>
import { objects } from '@milaboratory/helpers';
import { computed, onMounted, reactive } from 'vue';
import AddPane from './AddPane.vue';
import EditPane from './EditPane.vue';
import type { ManageModalSettings, Column } from './types';

const emit = defineEmits<{
  (e: 'update:columns', value: Column[]): void;
  (e: 'close'): void;
}>();

const props = defineProps<{
  settings: ManageModalSettings;
}>();

const form = reactive({
  addMode: false,
  columnId: undefined as string | undefined,
  columns: [] as Column[],
  isValid: true,
});

const checkIsValid = (spec: unknown) => {
  return props.settings.validate ? props.settings.validate(spec) : true;
};

const storedColumns = computed<Column[]>(() => {
  return props.settings.items.map((e) => {
    const columnSettings = props.settings.findColumnSettings(e.spec);
    return {
      id: e.id,
      columnSettings,
      spec: e.spec ?? objects.deepClone(e.spec),
      isValid: checkIsValid(e.spec),
    };
  });
});

const selectColumnId = () => {
  if (!form.columnId || !form.columns.map((c) => c.id).includes(form.columnId)) {
    form.columnId = form.columns[0]?.id;
  }
};

const addColumn = (column: Column) => {
  const { columnSettings, spec, id } = column;
  form.columns.push({
    id,
    columnSettings,
    spec: columnSettings.refine ? columnSettings.refine.apply(spec) : spec,
    isValid: checkIsValid(spec),
  });
  form.addMode = false;
  form.columnId = form.columns[form.columns.length - 1]?.id;
};

const updateColumns = () => {
  emit('update:columns', form.columns);
};

const removeColumn = (columnId: string) => {
  form.columns = form.columns.filter((c) => c.id !== columnId);
  selectColumnId();
};

const updateColumn = (column: Column) => {
  const { columnSettings, spec, id } = column;
  form.columns = form.columns.map((c) => {
    return c.id === id
      ? ({ ...c, spec: columnSettings.refine ? columnSettings.refine.apply(spec) : spec, isValid: checkIsValid(column.spec) } as Column)
      : c;
  });
};

onMounted(() => {
  form.columns = objects.deepClone(storedColumns.value);
  selectColumnId();
});
</script>

<template>
  <add-pane v-if="form.addMode" :settings="settings" @add:column="addColumn" @close="form.addMode = false" />
  <edit-pane
    v-else
    :column-id="form.columnId"
    :columns="form.columns"
    :stored-columns="storedColumns"
    :settings="settings"
    @apply="updateColumns"
    @update:column="updateColumn"
    @remove:column="removeColumn"
    @select:column="form.columnId = $event"
    @close="$emit('close')"
    @open:add="form.addMode = true"
  />
</template>
