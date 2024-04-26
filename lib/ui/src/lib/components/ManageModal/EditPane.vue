<script lang="ts" setup>
import { BtnPrimary, BtnGhost, MaskIcon } from '@/lib';
import { objects } from '@milaboratory/helpers';
import type { Component } from 'vue';
import { computed } from 'vue';
import type { ManageModalSettings, Column } from './types';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'apply'): void;
  (e: 'update:column', value: Column): void;
  (e: 'remove:column', id: string): void;
  (e: 'select:column', id: string): void;
  (e: 'open:add'): void;
}>();

const props = defineProps<{
  settings: ManageModalSettings;
  columnId: string | undefined;
  columns: Column[];
  storedColumns: Column[];
}>();

const currentColumn = computed(() => props.columns.find((c) => c.id === props.columnId));

const isValid = computed(() => props.columns.every((col) => col.isValid));

const isReady = computed(() => !objects.deepEqual(props.storedColumns, props.columns) && isValid.value);

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

const getTitle = (column: Column) => {
  const { resolveTitle } = column.columnSettings;
  const title = (resolveTitle ? resolveTitle.apply(column.spec) : column.columnSettings.title).trim();
  return title ?? 'Unknown title';
};
</script>

<template>
  <div class="manage-columns form-modal" @click.stop>
    <div class="form-modal__title">{{ settings.title }}</div>
    <div class="left-right">
      <div>
        <div class="split__header">Type</div>
        <div class="filter__list">
          <div
            v-for="(col, i) in columns"
            :key="i"
            class="filter__chip"
            :class="{ active: col.id === props.columnId, invalid: !col.isValid }"
            @click.stop="$emit('select:column', col.id)"
          >
            <div class="filter__chip__title">{{ getTitle(col) }}</div>
            <mask-icon class="ml-auto" style="background-color: #e1e3eb" name="clear" @click.stop="removeColumn(col.id)" />
          </div>
          <div class="filter__button gap-12" style="cursor: pointer" @click.stop="$emit('open:add')">
            <i class="icon icon--add" />
            Add Column
          </div>
        </div>
      </div>
      <div v-if="ColumnComponent && currentColumn && columnId">
        <div class="split__header">Settings</div>
        <div style="margin: 0 24px 24px">
          <component
            :is="ColumnComponent"
            :key="currentColumn.id"
            :column="currentColumn"
            @update:column="(column: Column) => updateColumn(column)"
          />
        </div>
      </div>
      <div v-else class="not-found">
        <div class="split__header">Settings</div>
        <div class="not-found__cat" />
        <div class="not-found__message">Add columns to view additional settings</div>
      </div>
    </div>
    <div class="action-buttons d-flex row gap-8 mt-auto">
      <btn-primary :disabled="!isReady" @click.stop="$emit('apply')">Apply</btn-primary>
      <btn-ghost :justify-center="false" @click.stop="$emit('close')">Cancel</btn-ghost>
    </div>
  </div>
</template>
