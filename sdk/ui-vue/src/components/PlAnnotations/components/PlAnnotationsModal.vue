<script setup lang="ts">
import { isNil } from '@milaboratories/helpers';
import { PlPureSlideModal, PlSidebarGroup, useConfirm } from '@milaboratories/uikit';
import type { AnnotationScriptUi } from '@platforma-sdk/model';
import { computed, effect, shallowRef } from 'vue';
import type { SimplifiedUniversalPColumnEntry } from '../types';
import { getDefaultAnnotationScript } from '../utils';
import AnnotationsSidebar from './AnnotationsSidebar.vue';
import FilterSidebar from './FilterSidebar.vue';
import PlAnnotationCreateDialog from './PlAnnotationCreateDialog.vue';

// Models
const annotation = defineModel<AnnotationScriptUi>('annotation', { required: true, default: getDefaultAnnotationScript });
const opened = defineModel<boolean>('opened', { required: true });
// Props
const props = defineProps<{ columns: SimplifiedUniversalPColumnEntry[] }>();
// State
const selectedStepId = shallowRef<number | undefined>(undefined);
const selectedStep = computed(() => {
  return isNil(selectedStepId.value) || isNil(annotation.value)
    ? undefined
    : annotation.value.steps.find((step) => step.id === selectedStepId.value);
});
const hasAnnotation = computed(() => annotation.value.isCreated === true);

const openedDialog = computed({
  get: () => !hasAnnotation.value && opened.value,
  set: (value: boolean) => (opened.value = value),
});
const openedModal = computed({
  get: () => hasAnnotation.value && opened.value,
  set: (value: boolean) => (opened.value = value),
});
// Watchers
effect(function setDefaultStepId() {
  if (selectedStepId.value === undefined && annotation.value.steps.length > 0) {
    selectedStepId.value = annotation.value.steps[0].id;
  }
});
// Hooks
const confirmResetSchema = useConfirm({
  title: 'Reset Schema',
  message: 'Are you sure you want to reset the schema? This action cannot be undone.',
  confirmLabel: 'Yes, reset',
  cancelLabel: 'No, cancel',
});
// Actions
function handleCreateAnnotation(props: { type: 'byClonotype' | 'bySampleAndClonotype'; name: string }) {
  annotation.value.isCreated = true;
  annotation.value.mode = props.type;
  annotation.value.title = props.name;
  annotation.value.steps = [];
}

async function handleDeleteSchema() {
  if (await confirmResetSchema()) {
    annotation.value.isCreated = false;
    annotation.value.title = '';
    annotation.value.mode = 'byClonotype';
    annotation.value.steps = [];
    opened.value = false;
    selectedStepId.value = undefined;
  }
}

</script>

<template>
  <PlAnnotationCreateDialog v-model="openedDialog" @submit="handleCreateAnnotation"/>
  <PlPureSlideModal v-model="openedModal" :class="$style.modal" width="768px">
    <PlSidebarGroup :class="$style.sidebarGroup">
      <template #item-0>
        <AnnotationsSidebar
          v-model:annotation="annotation"
          v-model:selectedStepId="selectedStepId"
          :class="$style.sidebarItem"
          :columns="props.columns"
          @delete-schema="handleDeleteSchema"
        />
      </template>
      <template #item-1>
        <FilterSidebar
          v-model:step="selectedStep"
          :class="$style.sidebarItem"
          :columns="props.columns"
          :selectedStepId="selectedStepId"
        />
      </template>
    </PlSidebarGroup>
  </PlPureSlideModal>
</template>

<style lang="scss" module>
.modal {
  display: flex;
}

.sidebarGroup {
  width: 100%;
  height: 100%;
}

.sidebarItem {
  width: 100%;
  height: 100%;
}
</style>
