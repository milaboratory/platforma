<script setup lang="ts">
import { onUnmounted, useTemplateRef, computed, ref } from 'vue';
import type { AnnotationStepUi, FilterUi } from '@platforma-sdk/model';
import { PlSlideModal, PlBtnPrimary, PlBtnSecondary, PlBtnDanger, PlIcon24, PlMaskIcon16, PlIcon16, PlEditableTitle } from '@platforma-sdk/ui-vue';
import FilterCard from './FilterCard.vue';
import AddFilterForm from './AddFilterForm.vue';
import { useAnnotationsState } from './AnnotationsState';

const emit = defineEmits<{
  (e: 'delete'): void;
}>();

const props = defineProps<{
  step: AnnotationStepUi;
  index: number;
}>();

const commonState = useAnnotationsState();

const expandedFilterIndex = ref<number | undefined>(undefined);

const isEditStepModalOpen = computed({
  get: () => commonState.value.editStepModalIndex === props.index,
  set: (value) => {
    if (commonState.value.editStepModalIndex === props.index && !value) {
      commonState.value.editStepModalIndex = undefined;
    } else if (value) {
      console.log('open', props.index);
      commonState.value.editStepModalIndex = props.index;
    }
  },
});

const isAddFilterModalOpen = computed({
  get: () => commonState.value.addFilterModalIndex === props.index,
  set: (value) => {
    if (commonState.value.addFilterModalIndex === props.index) {
      commonState.value.addFilterModalIndex = value ? props.index : undefined;
    }
  },
});

const addFilter = () => {
  commonState.value.addFilterModalIndex = props.index;
};

const updateFilter = (index: number, filter: FilterUi) => {
  props.step.filter.filters[index] = filter;
};

const deleteFilter = (index: number) => {
  props.step.filter.filters.splice(index, 1);
};

const addFilterModal = useTemplateRef('addFilterModal');

const saveFilter = () => {
  const filter = addFilterModal.value?.localModel;
  if (!filter) {
    return;
  }
  props.step.filter.filters.push(filter as FilterUi);
  isAddFilterModalOpen.value = false;
};

const deleteStep = () => {
  emit('delete');
  isEditStepModalOpen.value = false;
  isAddFilterModalOpen.value = false;
};

onUnmounted(() => {
  isEditStepModalOpen.value = false;
  isAddFilterModalOpen.value = false;
});
</script>

<template>
  <div :class="$style.step" class="text-s" @click.stop="isEditStepModalOpen = true">
    <span>{{ step.label }}</span>
    <div style="flex-grow: 1;" />
    <PlMaskIcon16 name="sort" class="drag-handle" />
    <PlIcon24 name="chevron-right" />
  </div>
  <PlSlideModal v-model="isEditStepModalOpen" :close-on-outside-click="false">
    <template #title>
      <PlEditableTitle
        v-model="step.label"
        :max-length="40"
        max-width="600px"
        placeholder="Step Name"
      />
    </template>
    <template v-if="step">
      <!-- <PlTextField v-model="step.label" label="Label" /> -->
      <div :class="$style.filters">
        <FilterCard
          v-for="(filter, i) in step.filter.filters"
          :key="i"
          :model-value="filter"
          :expanded="expandedFilterIndex === i"
          @update:model-value="updateFilter(i, $event)"
          @delete="deleteFilter(i)"
          @expand="(v: boolean) => v ? expandedFilterIndex = i : expandedFilterIndex = undefined"
        />
        <PlBtnSecondary :class="$style.addFilterBtn" @click="addFilter">
          <PlIcon16 name="add" style="margin-right: 8px;" />
          Add filter
        </PlBtnSecondary>
      </div>
    </template>
    <template #actions>
      <PlBtnDanger icon="close" @click="deleteStep">Delete step</PlBtnDanger>
    </template>
  </PlSlideModal>
  <PlSlideModal v-model="isAddFilterModalOpen" :close-on-outside-click="false">
    <template #title>Add filter</template>
    <AddFilterForm v-if="isAddFilterModalOpen" ref="addFilterModal" @close="isAddFilterModalOpen = false" />
    <template #actions>
      <PlBtnPrimary @click="saveFilter">Save filter</PlBtnPrimary>
      <PlBtnSecondary @click="isAddFilterModalOpen = false">Cancel</PlBtnSecondary>
    </template>
  </PlSlideModal>
</template>

<style module>
:global(.drag-handle) {
  background-color: #fff;
  &:hover {
    background: var(--txt-01);
  }
}

.step {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 320px;
  height: 40px;
  flex-shrink: 0;
  padding: 8px 12px;
  gap: 8px;
  align-self: stretch;
  cursor: pointer;

  border-radius: 6px;
  border: 1px solid #E1E3EB;
  background: #F7F8FA;

  &:hover {
    background: #fff;
  }
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.addFilterBtn {
  border: 1px dashed #E1E3EB;
}
</style>
