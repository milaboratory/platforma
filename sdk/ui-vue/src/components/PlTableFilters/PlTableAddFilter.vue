<script setup lang="ts">
import { PlBtnGhost, PlBtnPrimary, PlDropdown, PlSlideModal, type ListOption } from '@milaboratories/uikit';
import type { PlTableFilterColumnId, PlTableFiltersStateEntry, PlTableFilterType, PTableColumnSpec } from '@platforma-sdk/model';
import { ref, toRefs, watch } from 'vue';
import PlTableFilterEntry from './PlTableFilterEntry.vue';

const show = defineModel<boolean>({ required: true });
const props = defineProps<{
  columnsById: Readonly<Record<PlTableFilterColumnId, PTableColumnSpec>>;
  columnOptions: Readonly<ListOption<PlTableFilterColumnId>[]>;
  filterOptions: Readonly<Record<PlTableFilterColumnId, ListOption<PlTableFilterType>[]>>;
  makeFilter(columnId: string): PlTableFiltersStateEntry;
}>();
const { columnsById, columnOptions, filterOptions } = toRefs(props);
const emit = defineEmits<{
  addFilter: [PlTableFiltersStateEntry];
}>();

const newFilterColumnId = ref<string>();
const newFilter = ref<PlTableFiltersStateEntry>();
watch(
  () => newFilterColumnId.value,
  (newFilterColumnId) => {
    if (newFilterColumnId) newFilter.value = props.makeFilter(newFilterColumnId);
    else newFilter.value = undefined;
  },
);
const discardFilter = () => {
  newFilterColumnId.value = undefined;
  show.value = false;
};
const applyFilter = () => {
  if (newFilter.value) {
    emit('addFilter', newFilter.value);
    discardFilter();
  }
};
</script>

<template>
  <PlSlideModal v-model="show" :close-on-outside-click="false">
    <template #title>Add Filter</template>
    <div class="d-flex flex-column gap-24">
      <PlDropdown v-model="newFilterColumnId" :options="columnOptions" label="Column" placeholder="Choose..." />

      <div v-if="!newFilter" class="text-subtitle-m" style="color: var(--txt-mask)">Choose a column to view and adjust its options</div>

      <PlTableFilterEntry
        v-if="!!newFilter"
        v-model="newFilter"
        :column="columnsById[newFilter.columnId]"
        :options="filterOptions[newFilter.columnId]"
      />
    </div>
    <template #actions>
      <PlBtnPrimary :disabled="!newFilter" @click="applyFilter">Add Filter</PlBtnPrimary>
      <PlBtnGhost :justify-center="false" @click="discardFilter">Cancel</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>
