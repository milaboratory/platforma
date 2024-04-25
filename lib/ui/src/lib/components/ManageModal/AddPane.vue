<script lang="ts" setup>
import { BtnPrimary, BtnGhost } from '@/lib';
import type { Component } from 'vue';
import { computed, reactive, watchEffect } from 'vue';
import type { ColumnSettings, ManageModalSettings, Column } from './types';
import { strings } from '@milaboratory/helpers';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'add:column', value: Column): void;
}>();

const props = defineProps<{
  settings: ManageModalSettings;
}>();

const form = reactive({
  index: 0,
  column: undefined as Column | undefined,
});

watchEffect(() => {
  if (!form.column) {
    form.column = {
      id: strings.uniqueId(),
      spec: props.settings.defaultColumn().defaultSpec(),
    };
  }
});

const isReady = computed(() => form.column && form.column.spec);

const ColumnComponent = computed<Component<{ column: Column }> | undefined>(() => {
  return form.column ? props.settings.findColumnSettings(form.column.spec)?.component : undefined;
});

const selectForm = (s: ColumnSettings, index: number) => {
  form.column = {
    id: strings.uniqueId(),
    spec: s.defaultSpec(),
  };
  form.index = index;
};

const updateColumn = (column: Column) => {
  form.column = column;
};

const addColumn = () => {
  if (form.column) {
    emit('add:column', form.column);
  }
};
</script>

<template>
  <div class="manage-columns form-modal" @click.stop>
    <div class="form-modal__title">Add Column</div>
    <div class="left-right">
      <div>
        <div class="split__header">Type</div>
        <div class="filter__list">
          <div
            v-for="(s, i) in settings.columnSettings"
            :key="i"
            class="filter__it"
            :class="{ active: i === form.index }"
            @click.stop="() => selectForm(s, i)"
          >
            <div class="filter__title">{{ s.title }}</div>
            <div class="filter__description">{{ s.description }}</div>
          </div>
        </div>
      </div>
      <div>
        <div class="split__header">Settings</div>
        <div style="margin: 0 24px">
          <component :is="ColumnComponent" v-if="ColumnComponent" :column="form.column" @update:column="updateColumn" />
          <div v-if="!ColumnComponent">Not found</div>
        </div>
      </div>
    </div>
    <div class="action-buttons d-flex row gap-8 mt-auto">
      <btn-primary :disabled="!isReady" @click.stop="addColumn">Add Column</btn-primary>
      <btn-ghost :justify-center="false" @click.stop="$emit('close')">Cancel</btn-ghost>
    </div>
  </div>
</template>
