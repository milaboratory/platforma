<script lang="ts" setup>
import { BtnPrimary, BtnGhost, MaskIcon } from '@/lib';
import { objects } from '@milaboratory/helpers';
import type { Component } from 'vue';
import { computed } from 'vue';
import type { ManageModalSettings, ColumnInfo, Column } from './types';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply'): void;
  (e: 'update:column', value: { id: string; spec: unknown }): void;
  (e: 'remove:column', id: string): void;
  (e: 'select:column', id: string): void;
  (e: 'open:add'): void;
}>();

const props = defineProps<{
  settings: ManageModalSettings;
  columnId: string | undefined;
  columns: ColumnInfo[];
  storedColumns: ColumnInfo[];
}>();

const currentColumn = computed(() => props.columns.find((c) => c.id === props.columnId));

const isReady = computed(() => !objects.deepEqual(props.storedColumns, props.columns));

const ColumnComponent = computed<Component | undefined>(() => {
  const columnSpec = currentColumn.value?.spec;
  return columnSpec ? props.settings.findColumnSettings(columnSpec)?.component : undefined;
});

const updateColumn = (column: Column) => {
  emit('update:column', column);
};

const removeColumn = (columnId: string) => {
  emit('remove:column', columnId);
};
</script>

<template>
  <div class="manage-columns form-modal" @click.stop>
    <div class="form-modal__title">{{ settings.title }}</div>
    <div class="left-right" style="flex: 1">
      <div>
        <div class="split__header">Type</div>
        <div class="filter__list">
          <div
            v-for="(col, i) in columns"
            :key="i"
            class="filter__chip"
            :class="{ active: col.id === props.columnId }"
            @click.stop="$emit('select:column', col.id)"
          >
            <div class="filter__chip__title">
              {{ col.title }}
            </div>
            <mask-icon class="ml-auto" style="background-color: #e1e3eb" name="clear" @click.stop="removeColumn(col.id)" />
          </div>
          <div class="filter__button gap-12" style="cursor: pointer" @click.stop="$emit('open:add')">
            <i class="icon icon--add" />
            Add Column
          </div>
        </div>
      </div>
      <div>
        <div class="split__header">Settings</div>
        <div style="margin: 0 24px 24px">
          <component
            :is="ColumnComponent"
            v-if="ColumnComponent && currentColumn && columnId"
            :key="currentColumn.id"
            :column="currentColumn"
            @update:column="(column: Column) => updateColumn(column)"
          />
          <div v-else>Not found form component</div>
        </div>
      </div>
    </div>
    <div class="action-buttons d-flex row gap-8 mt-auto">
      <btn-primary :disabled="!isReady" @click.stop="$emit('apply')">Apply</btn-primary>
      <btn-ghost :justify-center="false" @click.stop="$emit('close')">Cancel</btn-ghost>
    </div>
  </div>
</template>
